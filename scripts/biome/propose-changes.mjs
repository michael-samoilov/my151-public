

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'biome-research', 'output');

const { records } = JSON.parse(readFileSync(join(OUT_DIR, 'biome-assignments.json'), 'utf8'));

const PLACE_BUILD_SECTIONS = ['forest', 'meadow', 'cave-pokemon', 'swamp', 'dojo', 'haunted', 'ruins', 'beach', 'fishing-pokemon', 'ocean', 'desert', 'volcanic', 'tundra', 'industrial'];
const PROMOTION_SECTIONS = ['mountain', 'lake'];

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
const inArchetype = (r, arch) => {
  const set = archetypeIds.get(arch);
  return set ? r.members.some((id) => set.has(id)) : false;
};

const CONF = { high: 'H', medium: 'M', low: 'L' };

const news = [];
const switches = [];
const switchesMediumCount = [];
const dedups = [];
let skippedMece = 0;

for (const r of records) {
  const target = r.recommendedSection;
  if (!target) continue;
  const covPlaces = r.currentlyCovered.filter((s) => PLACE_BUILD_SECTIONS.includes(s));
  const covNonPlace = r.currentlyCovered.filter((s) => !PLACE_BUILD_SECTIONS.includes(s));

  if (r.currentlyCovered.length === 0) {
    if (inArchetype(r, target)) continue;

    const conflict = PROMOTION_SECTIONS.find((s) => inArchetype(r, s));
    news.push({ r, target, conflict });
    continue;
  }

  if (covPlaces.length >= 2) {

    const perSection = covPlaces.map((s) => ({ s, ids: r.members.filter((id) => archetypeIds.get(s)?.has(id)) }));
    let trueOverlap = false;
    for (let i = 0; i < perSection.length && !trueOverlap; i++) {
      for (let k = i + 1; k < perSection.length; k++) {
        if (perSection[i].ids.some((id) => perSection[k].ids.includes(id))) { trueOverlap = true; break; }
      }
    }
    const keep = covPlaces.includes(target) ? target : covPlaces[0];
    dedups.push({ r, keep, drop: covPlaces.filter((s) => s !== keep), judgment: !covPlaces.includes(target), formSplit: !trueOverlap });
    continue;
  }

  if (covPlaces.length === 1 && covPlaces[0] !== target && !inArchetype(r, target)) {
    if (r.confidence === 'high') switches.push({ r, from: covPlaces[0], target });
    else if (r.confidence === 'medium') switchesMediumCount.push(r.line);
    continue;
  }

  if (covPlaces.length === 0 && covNonPlace.length > 0) skippedMece++;
}

const SECTION_ORDER = ['forest', 'meadow', 'cave-pokemon', 'mountain', 'swamp', 'lake', 'dojo', 'haunted', 'ruins', 'beach', 'fishing-pokemon', 'ocean', 'desert', 'volcanic', 'tundra', 'industrial'];
const CONF_ORDER = { high: 0, medium: 1, low: 2 };
const rows = [];
for (const { r, target, conflict } of news) {
  rows.push({
    section: target,
    line: r.line,
    conf: r.confidence,
    origin: conflict ? `new — uncovered ⚠ also curated in ${conflict} archetype (pick one)` : 'new — currently uncovered',
    basis: r.source === 'encounters' ? `${Math.round((r.scores[0]?.share ?? 0) * 100)}% · ${r.scores[0]?.games}g` : r.source,
  });
}
for (const { r, from, target } of switches) {
  rows.push({
    section: target,
    line: r.line,
    conf: r.confidence,
    origin: `switch — from ${from}`,
    basis: r.source === 'encounters' ? `${Math.round((r.scores[0]?.share ?? 0) * 100)}% · ${r.scores[0]?.games}g` : r.source,
  });
}
for (const { r, keep, drop, judgment, formSplit } of dedups) {
  if (formSplit) continue;
  rows.push({
    section: keep,
    line: r.line,
    conf: r.confidence,
    origin: `dedup — drop from ${drop.join(', ')}${judgment ? ` (pipeline itself says ${r.recommendedSection})` : ''}`,
    basis: r.source === 'encounters' ? `${Math.round((r.scores[0]?.share ?? 0) * 100)}% · ${r.scores[0]?.games}g` : r.source,
  });
}
rows.sort((a, b) =>
  SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
  (CONF_ORDER[a.conf] ?? 3) - (CONF_ORDER[b.conf] ?? 3) ||
  a.line.localeCompare(b.line));

const md = [];
md.push('# Proposed section changes (MECE-respecting)');
md.push('');
md.push('Ordered by proposed build-page section, then confidence. "Change origin" says where the line comes from: **new** (in no build section today), **switch** (currently in a different place section), or **dedup** (currently in multiple place sections; keep this one).');
md.push('');
md.push(`- New: ${news.length} · Switches (high conf): ${switches.length} (medium-conf disagreements left to validation-report.md: ${switchesMediumCount.length}) · Dedups: ${dedups.filter((d) => !d.formSplit).length} true overlaps (+${dedups.filter((d) => d.formSplit).length} legitimate form-splits, no action)`);
md.push(`- Skipped to preserve MECE: ${skippedMece} lines already covered by a non-place section`);
md.push('');
md.push('| Proposed section | Line | Conf | Change origin | Evidence |');
md.push('|---|---|---|---|---|');
for (const row of rows) {
  md.push(`| ${row.section} | ${row.line} | ${CONF[row.conf] ?? '—'} | ${row.origin} | ${row.basis} |`);
}
md.push('');
md.push('Form-splits (different members per section — legitimate, no action): ' +
  (dedups.filter((d) => d.formSplit).map((d) => `${d.r.line} (${[d.keep, ...d.drop].join(' + ')})`).join('; ') || 'none') + '.');
md.push('');

const ins = new Map();
const outs = new Map();
const bump = (m, s, n) => m.set(s, (m.get(s) ?? 0) + n);
const baseMembers = (r) => r.members.filter((id) => id < 10000).length;
const idsIn = (r, section) => r.members.filter((id) => archetypeIds.get(section)?.has(id));

for (const { r, target, conflict } of news) {
  bump(ins, target, baseMembers(r));
  if (conflict) bump(outs, conflict, idsIn(r, conflict).length);
}
for (const { r, from, target } of switches) {
  bump(ins, target, baseMembers(r));
  bump(outs, from, idsIn(r, from).length);
}
for (const { r, keep, drop, formSplit } of dedups) {
  if (formSplit) continue;
  const keepSet = archetypeIds.get(keep) ?? new Set();
  for (const d of drop) {
    const dupIds = idsIn(r, d).filter((id) => keepSet.has(id));
    bump(outs, d, dupIds.length);
  }
}

const LOW_WATER = 15;
md.push('## Net flow per section (in Pokémon, not lines)');
md.push('');
md.push(`Current = raw archetype list size (incl. regional-form ids). Final = current + in − out. ⚠ marks sections that would land under ${LOW_WATER}.`);
md.push('');
md.push('| Section | Current | In | Out | Net | Final |');
md.push('|---|---|---|---|---|---|');
for (const s of SECTION_ORDER) {
  const cur = archetypeIds.get(s)?.size ?? 0;
  const i = ins.get(s) ?? 0;
  const o = outs.get(s) ?? 0;
  const fin = cur + i - o;
  md.push(`| ${s} | ${cur} | +${i} | −${o} | ${i - o >= 0 ? '+' : ''}${i - o} | ${fin}${fin < LOW_WATER ? ' ⚠' : ''} |`);
}
md.push('');

writeFileSync(join(OUT_DIR, 'proposed-changes.md'), md.join('\n'));
console.log(md.join('\n'));
