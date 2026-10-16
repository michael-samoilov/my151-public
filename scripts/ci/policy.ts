import { execFileSync } from 'node:child_process';

export type Mode = 'fast' | 'affected' | 'full';
export interface Selection {
  requestedMode: Mode;
  effectiveMode: Mode | 'docs';
  baseSha: string | null;
  changedPaths: string[];
  suitePattern: string;
  reasons: string[];
}
export interface Options { mode: Mode; base?: string; plan: boolean }

const dexSuites = [
  'dex-', 'drag-hold', 'empty-states', 'header-chrome', 'sheet-', 'browser-grid-window',
  'bottom-sheet', 'pinch-zoom', 'intro-collapse-scroll', 'completion-confetti',
  'analytics-drilldown', 'chart-identifiers', 'stats-export-framing', 'wordmark-home',
  'beacon-delivery', 'active-attention', 'minute-activity', 'optout-follows', 'feedback',
  'english-copy', 'language-negotiation', 'served-faq', 'service-worker', 'stale-deploy', 'dev/',
].join('|');
const areas = [
  { name: 'picker', paths: /^(?:src\/favorites\/|e2e\/(?:favorites-|favorite-browser-filter|picker-close-|picks-page))/, suites: '(?:favorites-|favorite-browser-filter|picker-close-|picks-page)' },
  { name: 'league', paths: /^(?:src\/league\/|e2e\/league-)/, suites: '(?:league-|header-chrome|empty-states|stats-export-framing)' },
  { name: 'admin', paths: /^(?:src\/components\/admin\/|e2e\/admin-)/, suites: '(?:admin-|picks-page)' },
  { name: 'dex', paths: /^(?:src\/components\/(?:pokedex|view)\/|src\/(?:App|main)\.tsx$|e2e\/dex-)/, suites: `(?:${dexSuites})` },
];
const docs = /^(?:docs\/.+\.md|README\.md|AGENTS\.md|CLAUDE\.md|LICENSE)$/;
const crossTool = [
  /^src\/favorites\/(?:model|export|data|icons|stats)\//,
  /^src\/favorites\/(?:pickerFullName|pickerDisplayNames)\./,
  /^src\/favorites\/components\/(?:DesktopPane|FavoritesGrid|PickerTitle|PrettySpriteGrid|spriteLabel|coordinatePresentation|marks|WordBadge|badgeStyle|WideBadge|NameTooltip|PickerSprite|ExtraSymbol|extraSymbolAssets|CoordinatePills|coordinatePillLayout|romanDiscAssets|ballShape)\./,
  /^src\/league\/(?:model|export|data)\//,
  /^src\/league\/(?:theme|slotLab|LeagueApp)\./,
  /^src\/league\/components\/(?:ExportPreview3D|LeagueExportSurvey|LeagueExportSurveyIntro|glyphs)\./,
  /^src\/league\/components\/foil\//,
  /^src\/components\/view\/(?:DetailedStatsPanel|useDetailedStatsData|ViewPage)\./,
];
const shared = /^(?:api\/|scripts\/|\.github\/|\.claude\/|public\/|src\/(?:store|lib|i18n|data|assets)\/)|(?:^|\/)(?:[^/]*[Ss]tore[^/]*|[^/]*[Pp]ersist[^/]*|[^/]*[Mm]igrat[^/]*)\.[^/]+$|(?:^|\/)store\//;

export function parseOptions(args: string[]): Options {
  const input = [...args];
  const mode = input.shift() ?? 'affected';
  if (!['fast', 'affected', 'full'].includes(mode)) throw new Error(`Unknown CI mode: ${mode}`);
  const result: Options = { mode: mode as Mode, plan: false };
  while (input.length) {
    const flag = input.shift();
    if (flag === '--plan') result.plan = true;
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

export function select(requestedMode: Mode, changedPaths: string[], baseSha: string | null, unavailable?: string): Selection {
  const selection: Selection = { requestedMode, effectiveMode: requestedMode, baseSha, changedPaths, suitePattern: '@ci-smoke', reasons: [] };
  if (requestedMode === 'full') return { ...selection, suitePattern: '.*', reasons: ['Full regression explicitly requested.'] };
  if (requestedMode === 'fast') return { ...selection, reasons: ['Critical journeys explicitly requested; use affected for merge verification.'] };
  if (!baseSha) return { ...selection, effectiveMode: 'full', suitePattern: '.*', reasons: [unavailable ?? 'Comparison base unavailable.'] };
  if (!changedPaths.length) return { ...selection, effectiveMode: 'fast', reasons: ['No changed files; run the critical journeys.'] };
  if (changedPaths.every(path => docs.test(path))) return { ...selection, effectiveMode: 'docs', suitePattern: '', reasons: ['Only known Markdown documentation changed; no executable inputs changed.'] };
  const selected = new Set<string>();
  for (const path of changedPaths) {
    if (docs.test(path)) continue;
    const area = shared.test(path) || crossTool.some(pattern => pattern.test(path)) ? undefined : areas.find(area => area.paths.test(path));
    if (!area) return { ...selection, effectiveMode: 'full', suitePattern: '.*', reasons: [`Shared or unclassified input requires full regression: ${path}`] };
    selected.add(area.suites);
    selection.reasons.push(`${path}: all ${area.name} specs.`);
  }
  return { ...selection, suitePattern: ['@ci-smoke', ...selected].join('|') };
}

export function projectFilter(suitePattern: string, viewportOnly: boolean): RegExp {
  if (!suitePattern) throw new Error('An empty browser selection is invalid.');
  return new RegExp(`^${viewportOnly ? '(?=.*@viewport)' : ''}(?=.*(?:${suitePattern}))`);
}
