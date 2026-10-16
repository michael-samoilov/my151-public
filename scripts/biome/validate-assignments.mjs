

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'biome-research', 'output');
const SCRIPT_DIR = join(ROOT, 'scripts', 'biome');

const { records } = JSON.parse(readFileSync(join(OUT_DIR, 'biome-assignments.json'), 'utf8'));
const goldens = JSON.parse(readFileSync(join(SCRIPT_DIR, 'golden-expectations.json'), 'utf8')).entries;
const pokemon = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'pokemon.json'), 'utf8'));
const nameToId = new Map(pokemon.map((p) => [p.name, p.id]));
const recordByMember = new Map();
for (const r of records) for (const id of r.members) recordByMember.set(id, r);

const PLACE_ARCHETYPES = ['forest', 'meadow', 'cave-pokemon', 'mountain', 'swamp', 'lake', 'dojo', 'haunted', 'ruins', 'beach', 'fishing-pokemon', 'ocean', 'desert', 'volcanic', 'tundra', 'industrial'];
const TAG_BY_SECTION = { 'cave-pokemon': 'cave', 'fishing-pokemon': 'fishing' };
const archetypesSrc = readFileSync(join(ROOT, 'src', 'data', 'archetypes.ts'), 'utf8');
const archetypeIds = new Map();
{
  const tokens = [...archetypesSrc.matchAll(/id:\s*'([\w-]+)'|pokemonIds:\s*\[([^\]]*)\]/g)];
  let current = null;
  for (const tok of tokens) {
    if (tok[1] !== undefined) {
      current = tok[1];
      if (!archetypeIds.has(current)) archetypeIds.set(current, new Set());
    } else if (current) {
      for (const n of tok[2].match(/\d+/g) ?? []) archetypeIds.get(current).add(Number(n));
    }
  }
}

const goldenResults = [];
for (const g of goldens) {
  const id = nameToId.get(g.species);
  const r = id != null ? recordByMember.get(id) : null;
  if (!r) {
    goldenResults.push({ ...g, status: 'MISSING', got: null });
    continue;
  }
  const ok = g.allowed.includes(r.recommended);
  goldenResults.push({ ...g, status: ok ? 'PASS' : 'FAIL', got: r.recommended, confidence: r.confidence, source: r.source, line: r.line, rationale: r.rationale });
}
const failures = goldenResults.filter((g) => g.status !== 'PASS');

const placed = records.filter((r) => r.source === 'encounters');

const gateViolations = placed.filter((r) => r.evidenceStrength < 1.0);

const cameoSuspect = placed.filter((r) => {
  const top = r.scores[0];
  if (!top || top.maxRarity == null || top.maxRarity >= 10) return false;
  return r.scores.slice(1).some((s) => s.maxRarity != null && s.maxRarity >= 3 * top.maxRarity);
});

const singleLocation = placed.filter((r) =>
  r.evidence && r.evidence.locations.length + r.evidence.omittedLocations === 1);

const narrowMargin = placed.filter((r) =>
  r.scores.length >= 2 && r.scores[0].share - r.scores[1].share < 0.10);

const minoritySlice = placed.filter((r) =>
  r.scores[0]?.games <= 2 && r.totalContexts >= 8);

const curationDisagreement = [];
for (const r of records) {
  if (!r.recommendedSection && r.source !== 'encounters') continue;
  const curatedIn = PLACE_ARCHETYPES.filter((a) => {
    const set = archetypeIds.get(a);
    return set && r.members.some((id) => set.has(id));
  });
  if (!curatedIn.length) continue;
  const curatedTags = curatedIn.map((a) => TAG_BY_SECTION[a] ?? a);
  if (r.recommended && !curatedTags.includes(r.recommended) && r.recommended !== 'needs-review') {
    curationDisagreement.push({ line: r.line, recommended: r.recommended, confidence: r.confidence, source: r.source, curatedIn });
  }
}

const md = [];
md.push('# Biome assignment validation report');
md.push('');
md.push(`Golden expectations: **${goldenResults.length - failures.length}/${goldenResults.length} pass**${failures.length ? ` — ${failures.length} FAILURES` : ''}`);
md.push('');
if (failures.length) {
  md.push('## FAILURES');
  md.push('');
  md.push('| Species | Expected one of | Got | Conf | Source | Why we expected it |');
  md.push('|---|---|---|---|---|---|');
  for (const f of failures) md.push(`| ${f.species} | ${f.allowed.join(', ')} | **${f.got ?? 'missing'}** | ${f.confidence ?? '—'} | ${f.source ?? '—'} | ${f.reason} |`);
  md.push('');
}
md.push('## All golden results');
md.push('');
md.push('| Species | Expected one of | Got | Status |');
md.push('|---|---|---|---|');
for (const g of goldenResults) md.push(`| ${g.species} | ${g.allowed.join(', ')} | ${g.got ?? '—'} | ${g.status} |`);

const flagSection = (title, desc, rows, fmt) => {
  md.push('');
  md.push(`## ${title} (${rows.length})`);
  md.push('');
  md.push(desc);
  md.push('');
  if (!rows.length) { md.push('_None._'); return; }
  for (const r of rows) md.push(fmt(r));
};

flagSection(
  'Gate violations', 'Lines confidently placed despite weak evidence — MUST be empty (pipeline bug otherwise).',
  gateViolations, (r) => `- ${r.line} → ${r.recommended} (strength ${r.evidenceStrength}, ${r.totalContexts} ctx)`);

flagSection(
  'Cameo-suspect placements', 'The recommended tag\'s best encounter rate is low (<10%) while another tag offers ≥3× better rates — "rare here, common there" suggests the winner may be a cameo. (Rare-everywhere lines like Dreepy are NOT flagged: their rare slots are canonical.)',
  cameoSuspect, (r) => `- ${r.line} → ${r.recommended} (${r.confidence}; best ≤${r.scores[0].maxRarity}%) vs ${r.scores.slice(1).filter((s) => s.maxRarity >= 3 * r.scores[0].maxRarity).map((s) => `${s.tag} ≤${s.maxRarity}%`).join(', ')}`);

flagSection(
  'Single-location placements', 'Substantiated by exactly one location. Legitimate for true endemics (Minior/Mount Hokulani) — review the rest.',
  singleLocation, (r) => `- ${r.line} → ${r.recommended} (${r.confidence}); ${r.evidence.locations[0].location} (${r.evidence.locations[0].region}, ${r.evidence.locations[0].games.length}g)`);

flagSection(
  'Narrow margins', 'Top tag beats the runner-up by <10 share points — the placement is a coin-flip; consider either.',
  narrowMargin, (r) => `- ${r.line}: ${r.scores[0].tag} ${Math.round(r.scores[0].share * 100)}% vs ${r.scores[1].tag} ${Math.round(r.scores[1].share * 100)}% (${r.confidence})`);

flagSection(
  'Minority-slice placements', 'Broad line (≥8 contexts) placed by a tag seen in ≤2 games — the recommendation hinges on a small slice of its appearances.',
  minoritySlice, (r) => `- ${r.line} → ${r.recommended} (top tag in ${r.scores[0].games} game(s) out of ${r.totalContexts} total contexts)`);

flagSection(
  'Curation disagreements', 'The pipeline pick differs from every place archetype the line is already curated into. Not necessarily wrong — but each is either a curation gap or a pipeline blind spot.',
  curationDisagreement, (r) => `- ${r.line}: pipeline says **${r.recommended}** (${r.confidence ?? '—'}, ${r.source}); curated in ${r.curatedIn.join(', ')}`);

md.push('');
writeFileSync(join(OUT_DIR, 'validation-report.md'), md.join('\n'));

console.log(`Goldens: ${goldenResults.length - failures.length}/${goldenResults.length} pass`);
for (const f of failures) console.log(`  FAIL ${f.species}: expected [${f.allowed.join(', ')}], got ${f.got} (${f.source}) — ${f.rationale ?? ''}`);
console.log(`Gate violations: ${gateViolations.length} (must be 0)`);
console.log(`Flags — cameo-suspect: ${cameoSuspect.length}, single-location: ${singleLocation.length}, narrow-margin: ${narrowMargin.length}, minority-slice: ${minoritySlice.length}, curation-disagreement: ${curationDisagreement.length}`);
console.log(`Wrote ${join(OUT_DIR, 'validation-report.md')}`);
if (failures.length || gateViolations.length) process.exitCode = 1;
