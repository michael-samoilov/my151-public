/**
 * What the implied-level regression does to the dataset.
 *
 * Run it when the curve, the fit or the evolution data changes:
 *
 *     npm run level-report
 *
 * It prints the fit, its error, every level-less evolver's implied level, and
 * the cases where the model produces something the card cannot show honestly.
 * `src/league/LevelsPage.tsx` renders the same numbers in the browser.
 */
// The dataset directly, not through `usePokemonData` — that module pulls in
// the i18n catalogs, which are loaded with `import.meta.glob` and so only
// resolve inside Vite.
import pokemonData from '../src/data/pokemon.json' with { type: 'json' };
import { LEVEL_CURVE, ROW_COUNT, TEAM_SIZES, joinRow } from '../src/league/model/constants';
import {
  arrivalLevelWith,
  fitLevelOnBst,
  fitQuality,
  isLevelEvolver,
  isLevellessEvolver,
  predictLevel,
  rowForLevel,
} from '../src/league/model/levelFit';
import type { Pokemon } from '../src/types/pokemon';

const all = pokemonData as unknown as Pokemon[];
const byId = new Map(all.map((p) => [p.id, p]));
const getPokemonById = (id: number) => byId.get(id);

const arrivalLevel = (p: Pokemon) => arrivalLevelWith(p, fit);
const fit = fitLevelOnBst(all);
const known = all.filter(isLevelEvolver);
const implied = all.filter(isLevellessEvolver);
const { r2, rmse } = fitQuality(all, fit);

console.log('=== fit ===');
console.log(`level = ${fit.slope.toFixed(5)} * bst + ${fit.intercept.toFixed(3)}`);
console.log(`n=${known.length}  R²=${r2.toFixed(4)}  RMSE=${rmse.toFixed(2)} levels`);
console.log(`level-less evolvers: ${implied.length}`);
const levels = known.map((p) => p.evolutionLevel as number).sort((a, b) => a - b);
console.log(`real levels: min ${levels[0]}, median ${levels[levels.length >> 1]}, max ${levels[levels.length - 1]}`);
const bsts = known.map((p) => p.bst).sort((a, b) => a - b);
console.log(`fitted bst range: ${bsts[0]}–${bsts[bsts.length - 1]}`);

const rowFor = rowForLevel;

console.log('\n=== every level-less evolver, by implied level ===');
const rows = implied
  .map((p) => ({ p, level: arrivalLevel(p), row: rowFor(arrivalLevel(p)) }))
  .sort((a, b) => a.level - b.level || a.p.id - b.p.id);
for (const r of rows) {
  console.log(
    `${String(r.p.id).padStart(4)} ${r.p.name.padEnd(14)} bst ${String(r.p.bst).padStart(3)}  → L${String(r.level).padStart(2)}  row ${r.row}`,
  );
}

console.log('\n=== edge cases ===');

const report = (title: string, lines: string[]) => {
  console.log(`\n-- ${title} (${lines.length})`);
  for (const l of lines.slice(0, 40)) console.log('   ' + l);
  if (lines.length > 40) console.log(`   … ${lines.length - 40} more`);
};

// 1. A stage that arrives no later than the stage it evolves from.
const outOfOrder: string[] = [];
for (const p of all) {
  if (p.evolvesFrom === null) continue;
  const pre = getPokemonById(p.evolvesFrom);
  if (!pre || pre.evolvesFrom === null) continue;
  const a = arrivalLevel(p);
  const b = arrivalLevel(pre);
  if (a <= b) {
    outOfOrder.push(
      `${pre.name} L${b} → ${p.name} L${a}` +
      `  [${pre.evolutionLevel === null ? 'implied' : 'real'} → ${p.evolutionLevel === null ? 'implied' : 'real'}]`,
    );
  }
}
report('an evolution arrives at or before its own pre-evolution', outOfOrder);

// 2. Stages the curve can never show: above the last threshold.
const never = all
  .filter((p) => p.evolvesFrom !== null && rowFor(arrivalLevel(p)) > ROW_COUNT)
  .map((p) => `${p.name} L${arrivalLevel(p)} (curve tops out at ${LEVEL_CURVE[ROW_COUNT - 1]})`);
report('never reaches a row', never);

// 3. Implied levels the clamp had to move.
const clamped = implied
  .map((p) => ({ p, raw: predictLevel(p.bst, fit) }))
  .filter((x) => x.raw < 1 || x.raw > 70)
  .map((x) => `${x.p.name} raw ${x.raw.toFixed(1)} → ${arrivalLevel(x.p)}`);
report('clamped predictions', clamped);

// 4. Babies: an evolver whose own pre-evolution is a baby form.
const babies = all
  .filter((p) => p.evolvesFrom !== null && (getPokemonById(p.evolvesFrom)?.isBaby ?? false))
  .map((p) => `${getPokemonById(p.evolvesFrom!)!.name} → ${p.name} at L${arrivalLevel(p)}`);
report('lines that start on a baby form', babies);

// 5. Branch points: one pre-evolution, several evolutions.
const kids = new Map<number, Pokemon[]>();
for (const p of all) {
  if (p.evolvesFrom === null) continue;
  if (!kids.has(p.evolvesFrom)) kids.set(p.evolvesFrom, []);
  kids.get(p.evolvesFrom)!.push(p);
}
const branched = [...kids.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([id, v]) => `${getPokemonById(id)?.name}: ${v.map((c) => `${c.name} L${arrivalLevel(c)}`).join(', ')}`);
report('branching lines (the card seats one branch)', branched);

// 6. Lines whose stages cannot all fit the rows their seat offers.
const capacity: string[] = [];
for (let seat = 1; seat <= TEAM_SIZES[ROW_COUNT - 1]; seat++) {
  capacity.push(`seat ${seat} joins at row ${joinRow(seat)} → ${ROW_COUNT - joinRow(seat) + 1} rows`);
}
report('rows available per seat (a stage needs one each)', capacity);

// 7. Three-stage lines whose default boundaries collapse onto fewer rows.
const roots = all.filter((p) => p.evolvesFrom === null);
const collapsed: string[] = [];
for (const root of roots) {
  const chain: Pokemon[] = [root];
  for (;;) {
    const next = all.find((c) => c.evolvesFrom === chain[chain.length - 1].id);
    if (!next) break;
    chain.push(next);
  }
  if (chain.length < 2) continue;
  const boundaries = chain.map((p, i) => (i === 0 ? 1 : rowFor(arrivalLevel(p))));
  const shown = new Set<number>();
  for (let row = 1; row <= ROW_COUNT; row++) {
    let stage = 0;
    for (let i = 1; i < boundaries.length; i++) if (boundaries[i] <= row) stage = i;
    shown.add(stage);
  }
  if (shown.size < chain.length) {
    const missing = chain.filter((_, i) => !shown.has(i)).map((c) => c.name);
    collapsed.push(`${chain.map((c) => c.name).join(' → ')}  rows ${boundaries.join(',')}  never shown: ${missing.join(', ')}`);
  }
}
report('lines the curve skips a member of at seat 1 (the handle reveals them)', collapsed);

// 8. The biggest misses the fit makes on data it was fitted to.
const worst = known
  .map((p) => ({ p, err: (p.evolutionLevel as number) - predictLevel(p.bst, fit) }))
  .sort((a, b) => Math.abs(b.err) - Math.abs(a.err))
  .slice(0, 12)
  .map((x) => `${x.p.name.padEnd(14)} real L${x.p.evolutionLevel} predicted L${(x.p.evolutionLevel as number) - x.err > 0 ? ((x.p.evolutionLevel as number) - x.err).toFixed(1) : '?'}  off by ${x.err.toFixed(1)}`);
report('worst residuals among the level-evolvers themselves', worst);
