/**
 * The ontology build and check.
 *
 *   npm run ontology:check   load, resolve, check, and compare every generated file; writes nothing
 *   npm run ontology:build   the same, then write the generated files
 *
 * Generated files: src/data/pokemon.json (the Dex catalog) and data/ontology/reports/tool-verdicts.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../../src/ontology/model';
import type { AppIdLedger, Problem } from './authored';
import { checkOntology, type CheckEnvironment } from './check';
import { formatJson, readJson } from './json';
import { loadOntology } from './load';
import { AUDIT_REPORTS, type AuditReport } from './pokeapi/compare';
import { dexJson } from './projections/dex';
import { resolveOntology, type Ontology } from './resolve';

const PRODUCTION = 'origin/claude/pokedex-region-builder-AviYF';

function productionFile(root: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${PRODUCTION}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

export function checkEnvironment(root: string): CheckEnvironment {
  const ledger = productionFile(root, 'data/ontology/ids/app-ids.json');
  const dex = productionFile(root, 'src/data/pokemon.json');
  const auditReport = (path: string): AuditReport | null => (existsSync(join(root, path)) ? (readJson(join(root, path)) as AuditReport) : null);
  return {
    productionLedger: ledger ? (JSON.parse(ledger) as AppIdLedger) : null,
    productionDexNames: new Map(dex ? (JSON.parse(dex) as { id: number; name: string }[]).map((row) => [row.id, row.name]) : []),
    auditReports: { classification: auditReport(AUDIT_REPORTS.classification), fact: auditReport(AUDIT_REPORTS.fact) },
  };
}

export function verdictReport(ontology: Ontology): string {
  const rows = [...ontology.forms.values()].map((form) => ({
    form: form.id,
    appId: form.appId,
    ...Object.fromEntries(TOOLS.map((tool) => {
      const verdict = form.tools[tool];
      return [tool, verdict === 'in' ? 'in' : `out: ${JSON.stringify(verdict.out)}`];
    })),
  }));
  return `${formatJson(rows)}\n`;
}

export type Built = { readonly ok: true; readonly ontology: Ontology; readonly files: readonly { path: string; content: string }[] } | { readonly ok: false; readonly problems: readonly Problem[] };

export function buildOntology(root: string): Built {
  const loaded = loadOntology(root);
  if (!loaded.ontology) return { ok: false, problems: loaded.problems };
  const resolution = resolveOntology(loaded.ontology);
  if (!resolution.ok) return resolution;
  const problems = checkOntology(resolution.ontology, checkEnvironment(root));
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    ontology: resolution.ontology,
    files: [
      { path: 'src/data/pokemon.json', content: dexJson(resolution.ontology) },
      { path: 'data/ontology/reports/tool-verdicts.json', content: verdictReport(resolution.ontology) },
    ],
  };
}

export function printProblems(problems: readonly Problem[]): void {
  for (const problem of problems) console.error(`${problem.file}${problem.path ? ` ${problem.path}` : ''}: [${problem.code}] ${problem.message}`);
  console.error(`${problems.length} problem(s).`);
}

function main(): void {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const write = process.argv.includes('--write');
  const built = buildOntology(root);
  if (!built.ok) {
    printProblems(built.problems);
    process.exit(1);
  }
  const stale: string[] = [];
  for (const file of built.files) {
    const path = join(root, file.path);
    let current: string | null = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current === file.content) continue;
    if (write) writeFileSync(path, file.content);
    else stale.push(file.path);
  }
  const forms = built.ontology.forms.size;
  if (stale.length) {
    console.error(
      `${stale.join(', ')} differ(s) from data/ontology/. These files are generated from it. ` +
        'If you changed a Pokémon fact, make the change in its file under data/ontology/species/ instead, then run npm run ontology:build. ' +
        'Running the build without that step overwrites a hand edit to a generated file.',
    );
    process.exit(1);
  }
  console.log(`ontology ${write ? 'build' : 'check'}: ${built.ontology.species.size} species, ${forms} forms; ${built.files.map((file) => file.path).join(' and ')} ${write ? 'written' : 'match'}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
