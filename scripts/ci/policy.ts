import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { TEST_MAP_PATH, type TestMap } from './testMap';

export type Mode = 'fast' | 'affected' | 'full';
export interface Selection {
  requestedMode: Mode;
  effectiveMode: Mode | 'docs';
  baseSha: string | null;
  changedPaths: string[];
  suitePattern: string;
  reasons: string[];
  estimateMs: number;
}
export interface Options { mode: Mode; base?: string; plan: boolean; recordMap: boolean }

const docs = /^(?:docs\/.+\.md|README\.md|AGENTS\.md|CLAUDE\.md|LICENSE)$/;
const tooling = [
  { paths: /^\.claude\/(?:skills|agents|vendor)\//, coverage: 'agent tooling, covered by check-pstack, check-skill-triggers, the verify-my151 contract test, and the harness typecheck.' },
  { paths: /^docs\/i18n\/sources\/(?:bulbapedia|my151)-form-names\.json$/, coverage: 'read only by npm run i18n:names, whose regenerated catalogs under src/i18n/ are app inputs.' },
];
const spec = /^e2e\/.+\.spec\.ts$/;
const broad = /^(?:e2e\/|playwright\.config\.ts$|package(?:-lock)?\.json$|vite\.config\.ts$|tsconfig[^/]*\.json$|\.env)/;
const app = /^(?:src\/|public\/|[^/]+\.html$)/;
const ownGate = /^(?:api\/|scripts\/|data\/|docs\/|\.github\/|\.claude\/|eslint[^/]*$|vitest\.config\.ts$)|\.test\.ts$/;
export const BROWSER_BUDGET_MS = 3 * 60_000;
export const BROWSER_WORKERS = 2;

export function parseOptions(args: string[]): Options {
  const input = [...args];
  const mode = input.shift() ?? 'affected';
  if (!['fast', 'affected', 'full'].includes(mode)) throw new Error(`Unknown CI mode: ${mode}`);
  const result: Options = { mode: mode as Mode, plan: false, recordMap: false };
  while (input.length) {
    const flag = input.shift();
    if (flag === '--plan') result.plan = true;
    else if (flag === '--record-map') result.recordMap = true;
    else if (flag === '--base' && input.length) result.base = input.shift();
    else throw new Error(`Unknown or incomplete option: ${flag}`);
  }
  return result;
}

export function changedPaths(root: string, base?: string): { baseSha: string | null; paths: string[]; reason?: string } {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    if (!base) return { baseSha: null, paths: [], reason: 'No comparison base supplied; use --base REF or MY151_CI_BASE.' };
    const resolved = git('rev-parse', '--verify', '--end-of-options', `${base}^{commit}`).trim();
    const baseSha = git('merge-base', 'HEAD', resolved).trim();
    const readChanges = (...args: string[]) => {
      const fields = git('diff', '--name-status', '-z', '-M', ...args, '--').split('\0').filter(Boolean);
      const paths: string[] = [];
      for (let i = 0; i < fields.length;) {
        const status = fields[i++];
        paths.push(fields[i++]);
        if (/^[RC]/.test(status)) paths.push(fields[i++]);
      }
      return paths;
    };
    const paths = [
      ...readChanges(baseSha, 'HEAD'),
      ...readChanges('HEAD'),
      ...readChanges('--cached', 'HEAD'),
      ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean),
      ...git('ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', '.env', '.env.*').split('\0').filter(Boolean),
    ];
    return { baseSha, paths: [...new Set(paths)].sort() };
  } catch {
    return { baseSha: null, paths: [], reason: `Unusable comparison base: ${base}` };
  }
}

export interface SelectionInputs { map?: TestMap; buildScripts?: ReadonlySet<string> }

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function select(requestedMode: Mode, changedPaths: string[], baseSha: string | null, unavailable?: string, inputs: SelectionInputs = {}): Selection {
  const selection: Selection = { requestedMode, effectiveMode: requestedMode, baseSha, changedPaths, suitePattern: '@ci-smoke', reasons: [], estimateMs: 0 };
  if (requestedMode === 'full') return { ...selection, suitePattern: '.*', reasons: ['Full regression explicitly requested.'] };
  if (requestedMode === 'fast') return { ...selection, reasons: ['Critical journeys explicitly requested.'] };
  const smokeOnly = (reason: string) => ({ ...selection, effectiveMode: 'fast' as const, reasons: [...selection.reasons, reason] });
  if (!baseSha) return smokeOnly(`${unavailable ?? 'Comparison base unavailable.'} The post-release full run covers browser behavior.`);
  if (!changedPaths.length) return smokeOnly('No changed files; run the critical journeys.');
  if (changedPaths.every(path => docs.test(path))) return { ...selection, effectiveMode: 'docs', suitePattern: '', reasons: ['Only known Markdown documentation changed; no executable inputs changed.'] };
  const { map, buildScripts = new Set<string>() } = inputs;
  const specs = new Set<string>();
  const deferred: string[] = [];
  const mapped: string[] = [];
  const changedSpecs = new Set<string>();
  let appChanged = false;
  for (const path of changedPaths) {
    if (docs.test(path)) continue;
    const tool = tooling.find(tool => tool.paths.test(path));
    if (tool) {
      selection.reasons.push(`${path}: ${tool.coverage}`);
    } else if (spec.test(path)) {
      specs.add(path);
      changedSpecs.add(path);
    } else if (broad.test(path) || buildScripts.has(path)) {
      deferred.push(path);
      appChanged = true;
    } else if (app.test(path) && !ownGate.test(path)) {
      appChanged = true;
      const covering = map?.sources[path];
      if (covering) {
        covering.forEach(file => specs.add(file));
        mapped.push(path);
      } else deferred.push(path);
    } else if (!ownGate.test(path)) {
      deferred.push(path);
    }
  }
  if (!map && appChanged) return smokeOnly(`No test map at ${TEST_MAP_PATH}; run npm run ci:full -- --record-map. The post-release full run covers browser behavior.`);
  if (map && appChanged) for (const [file, timing] of Object.entries(map.specs)) if (timing.unmapped) specs.add(file);
  if (deferred.length) selection.reasons.push(`No recorded browser test runs ${deferred.join(', ')}; the release smoke and the post-release full run cover ${deferred.length === 1 ? 'it' : 'them'}.`);
  const cost = (file: string) => map?.specs[file]?.ms ?? 60_000;
  const estimate = (files: Iterable<string>) => Math.round([...files].reduce((sum, file) => sum + cost(file), 0) / BROWSER_WORKERS);
  const pattern = (files: Set<string>) => ['@ci-smoke', ...[...files].sort().map(file => escape(file.replace(/^e2e\//, '')))].join('|');
  if (!specs.size) return { ...selection, effectiveMode: 'fast', reasons: [...selection.reasons, 'No browser test runs the changed files; run the critical journeys.'] };
  const all = estimate(specs);
  if (all <= BROWSER_BUDGET_MS) {
    selection.reasons.push(`${specs.size} spec files run the changed files.`);
    return { ...selection, effectiveMode: 'affected', estimateMs: all, suitePattern: pattern(specs) };
  }
  const cover = new Set<string>();
  for (const path of [...mapped].sort((a, b) => map!.sources[a].length - map!.sources[b].length)) {
    const covering = map!.sources[path];
    if (covering.some(file => cover.has(file))) continue;
    cover.add(covering.reduce((cheapest, file) => (cost(file) < cost(cheapest) ? file : cheapest)));
  }
  const priority = (file: string) => (changedSpecs.has(file) ? 0 : 1);
  for (const file of [...specs].filter(file => !cover.has(file)).sort((a, b) => priority(a) - priority(b) || cost(a) - cost(b))) {
    if (estimate([...cover, file]) > BROWSER_BUDGET_MS) continue;
    cover.add(file);
  }
  const estimateMs = estimate(cover);
  selection.reasons.push(`Broad change: ${specs.size} spec files run the changed files, about ${Math.ceil(all / 60_000)} min. Running ${cover.size} within the ${BROWSER_BUDGET_MS / 60_000}-minute budget, including one for each changed file. The full-suite runner covers the rest after release; request a runner run before release for a risky change.`);
  return { ...selection, effectiveMode: 'affected', estimateMs, suitePattern: pattern(cover) };
}

export function buildScriptInputs(root: string): Set<string> {
  const found = new Set<string>();
  const pending = ['vite.config.ts'];
  for (let file = pending.shift(); file; file = pending.shift()) {
    let text = '';
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    for (const [, target] of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = normalize(join(dirname(file), target));
      const candidate = [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, `${base}.json`].find(path => existsSync(join(root, path)) && !statSync(join(root, path)).isDirectory());
      if (candidate && !candidate.startsWith('src/') && !found.has(candidate)) {
        found.add(candidate);
        pending.push(candidate);
      }
    }
  }
  return found;
}

export function projectFilter(suitePattern: string, viewportOnly: boolean): RegExp {
  if (!suitePattern) throw new Error('An empty browser selection is invalid.');
  return new RegExp(`^${viewportOnly ? '(?=.*@viewport)' : ''}(?=.*(?:${suitePattern}))`);
}
