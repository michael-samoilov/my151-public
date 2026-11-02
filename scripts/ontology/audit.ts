import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJson, readJson, writeJson } from './json';
import { loadOntology } from './load';
import { AUDIT_REPORTS, disagreementsOf, missingStateForms, rowKey, unmatchedForms, type AuditKind, type AuditReport, type AuditRow, type Disagreement, type Review } from './pokeapi/compare';
import { resolveOntology, type Ontology } from './resolve';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface PkhexInventoryRow {
  readonly id: number;
  readonly gamePersonal?: { readonly game: string; readonly stats?: unknown; readonly color?: string; readonly captureRate?: number; readonly growthRate?: string; readonly eggGroups?: readonly string[] };
}
const PKHEX_INVENTORY_PATH = 'docs/favorite-picker-work/form-metadata-audit/inventory.json';
const INVENTORY_FIELD_OF_FACT: Readonly<Record<string, keyof NonNullable<PkhexInventoryRow['gamePersonal']>>> = { baseStats: 'stats', color: 'color', captureRate: 'captureRate', growthRate: 'growthRate', eggGroups: 'eggGroups' };
const PKHEX_GAME_TITLE: Readonly<Record<string, string>> = {
  sv: 'Scarlet and Violet', swsh: 'Sword and Shield', la: 'Legends: Arceus', uu: 'Ultra Sun and Ultra Moon', ao: 'Omega Ruby and Alpha Sapphire',
  za: 'Legends: Z-A', hgss: 'HeartGold and SoulSilver',
};

const NOTES: Record<AuditKind, readonly string[]> = {
  classification: [
    'battleOnly compares the derived persistence with pokemon_forms.is_battle_only; mega with is_mega; default with is_default on the form and its pokemon.',
    'entry applies to Mega, Primal, and Gigantamax forms, which PokeAPI names after the form they enter from. Other states carry no entry information in the snapshot.',
    'unmatched lists forms PokeAPI does not know; their inherited facts are marked inherited:unsourced in the species file.',
    'missingStateForms lists power-up forms PokeAPI has for app species and the app does not.',
  ],
  fact: [
    'Level pokemon facts come from the form\'s pokemon row. Level species facts come from its species row; PokeAPI states color, shape, and egg groups per species, so a form\'s own value is compared with its species\' value.',
    'captureRate, growthRate, legendaryClass, baby, generation, genderRatio, hatchCycles, baseFriendship, and genus are compared once per species, on the default form.',
    'legendaryClass compares only the legendary flag: PokeAPI has one, the app splits it into sub-legendary and restricted and tags Ultra Beasts from its own list.',
    'The app\'s evolution chain number (legacy/evolution-chains.json, shipped in pokemon.json) is a family key, not PokeAPI\'s chain id. Measured on 2026-11-02: 576 species carry a different number, and the two numberings partition the 1,025 species into the same families (each app number maps to one PokeAPI chain and back). It is not compared; the legacy-chain-mismatch check proves species that evolve into each other share a number.',
    'A fact marked inherited:unsourced is not compared.',
  ],
};

function rules(ontology: Ontology, inventory: ReadonlyMap<number, PkhexInventoryRow>): (row: Disagreement) => Review | null {
  const entries = new Map(ontology.authored.species.flatMap(({ data }) => data.forms.map((entry) => [entry.id, entry] as const)));
  const sourceOfStated = (formId: string, fact: 'shape'): string | undefined => {
    const entry = entries.get(formId as never)!;
    if (fact in entry) return entry.sourceOf?.[fact] ?? entry.source;
    const base = ontology.forms.get(formId as never)!.base;
    return base ? sourceOfStated(base, fact) : undefined;
  };
  const pickerId = (form: string) => ontology.authored.legacy.picker.v1Ids[form] ?? ontology.forms.get(form as never)!.appId;
  const LEGENDARY_PARADOX = new Set(['walking-wake', 'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown']);
  const kept = (decision: string, note: string): Review => ({ status: 'kept', decision, note, auto: true });
  return (row) => {
    const form = ontology.forms.get(row.form)!;
    const step = form.states.at(-1)?.kind;
    if (row.fact === 'weightHg' && row.app === null && (step === 'gigantamax' || step === 'eternamax')) {
      return kept('gigantamax-weight-unknown-2026-10-20', `The games show "????.? kg" for a ${step} form; PokeAPI's ${row.source} is a placeholder.`);
    }
    if (row.fact === 'battleOnly' && row.app === true && step === 'eternamax') {
      return kept('spec-v2-state-kinds', 'Eternamax Eternatus appears only as the story raid boss and is never held outside battle; the spec names eternamax a state step.');
    }
    if (row.fact === 'entry' && row.form === 'floette-mega') {
      return kept('mega-floette-eternal-only-2026-10-29', 'PokeAPI names the form floette-mega, but its base stats (651 total) are Eternal Floette\'s plus 100, not plain Floette\'s plus 100 (471).');
    }
    if (row.fact === 'legendaryClass' && LEGENDARY_PARADOX.has(row.form) && row.app === 'legendary' && row.source === 'none') {
      return kept('legendary-paradox-flags-2026-10-20', 'PokeAPI does not flag the Paradox legendaries; the app lists them with the sub-legendaries.');
    }
    if (row.fact === 'shape' && sourceOfStated(row.form, 'shape') === 'legacy:src/data/form-shapes.json') {
      return kept('form-shape-review-2026-10-06', 'PokeAPI gives one shape per species; the form shape review set this form\'s own shape from Bulbapedia.');
    }
    const record = inventory.get(pickerId(row.form))?.gamePersonal;
    const key = INVENTORY_FIELD_OF_FACT[row.fact];
    if (record && key && key in record) {
      const game = record[key];
      const value = row.fact === 'eggGroups' ? [...(game as string[])].sort() : game;
      if (same(value, row.app)) return kept('form-metadata-audit-2026-10-20', `The ${PKHEX_GAME_TITLE[record.game] ?? record.game} personal record in ${PKHEX_INVENTORY_PATH} gives this value for the form; PokeAPI states the species' value.`);
    }
    return null;
  };
}

function report(kind: AuditKind, ontology: Ontology, root: string, rule: (row: Disagreement) => Review | null): AuditReport {
  const path = join(root, AUDIT_REPORTS[kind]);
  const previous = existsSync(path) ? (readJson(path) as AuditReport) : null;
  const reviews = new Map(previous?.rows.map((row) => [rowKey(row), row]) ?? []);
  const rows: AuditRow[] = disagreementsOf[kind](ontology).map((row) => {
    const old = reviews.get(rowKey(row));
    const keep = old && same(old.app, row.app) && same(old.source, row.source) && old.review.status !== 'unreviewed' && !('auto' in old.review);
    const review: Review = keep ? old.review : rule(row) ?? { status: 'unreviewed' };
    return { ...row, review };
  });
  const count = (status: Review['status']) => rows.filter((row) => row.review.status === status).length;
  const extra = kind === 'classification' ? { unmatched: unmatchedForms(ontology), missingStateForms: missingStateForms(ontology) } : {};
  return {
    source: ontology.authored.sources.find((source) => source.kind === 'pokeapi-csv')!.id,
    generated: 'npm run ontology:audit',
    notes: NOTES[kind],
    summary: { formsCompared: ontology.forms.size - unmatchedForms(ontology).length, disagreements: rows.length, kept: count('kept'), open: count('open'), unreviewed: count('unreviewed') },
    rows,
    ...extra,
    ...(previous?.questions ? { questions: previous.questions } : {}),
  };
}

export function auditReports(root: string): Record<AuditKind, AuditReport> {
  const loaded = loadOntology(root);
  if (!loaded.ontology) throw new Error(loaded.problems.map((problem) => `${problem.file} ${problem.path}: ${problem.message}`).join('\n'));
  const resolution = resolveOntology(loaded.ontology);
  if (!resolution.ok) throw new Error(resolution.problems.map((problem) => `${problem.file} ${problem.path}: ${problem.message}`).join('\n'));
  const inventoryPath = join(root, PKHEX_INVENTORY_PATH);
  const inventory = new Map<number, PkhexInventoryRow>(existsSync(inventoryPath) ? (JSON.parse(readFileSync(inventoryPath, 'utf8')) as PkhexInventoryRow[]).map((row) => [row.id, row]) : []);
  const rule = rules(resolution.ontology, inventory);
  return { classification: report('classification', resolution.ontology, root, rule), fact: report('fact', resolution.ontology, root, rule) };
}

export const formatReport = (value: AuditReport): string => `${formatJson(value)}\n`;

function main(): void {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const reports = auditReports(root);
  for (const kind of Object.keys(AUDIT_REPORTS) as AuditKind[]) {
    writeJson(join(root, AUDIT_REPORTS[kind]), reports[kind]);
    const { summary } = reports[kind];
    console.log(`${AUDIT_REPORTS[kind]}: ${summary.disagreements} disagreements (${summary.kept} kept, ${summary.open} open, ${summary.unreviewed} unreviewed).`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
