// Condensed, MECE-respecting change list derived from biome-assignments.json:
//
//   NEW    — line is in NO build-page section today; add to its recommended
//            place section (mountain/lake count as target sections pending
//            promotion; lines already curated in those archetypes are skipped
//            since promoting the section covers them).
//   SWITCH — line currently sits in a place section that disagrees with a
//            HIGH-confidence recommendation; move it (medium-confidence
//            disagreements are counted but left to the curation-disagreement
//            list in validation-report.md).
//   DEDUP  — line is in 2+ place sections today (already violates MECE);
//            keep exactly one (the recommendation if it's among them,
//            otherwise the first current one, flagged for judgment).
//
// Lines whose only coverage is a NON-place section (starter, legendary,
// pikaclone, early-route, mimic, …) are NOT added anywhere — adding them
// would create cross-section overlap. Their count is reported.
//
// Run after build-assignments.mjs:  node scripts/biome/propose-changes.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'docs', 'biome-research', 'output');

const { records } = JSON.parse(readFileSync(join(OUT_DIR, 'biome-assignments.json'), 'utf8'));

// Place sections: the 14 on the build page + the two promotion candidates.
const PLACE_BUILD_SECTIONS = ['forest', 'meadow', 'cave-pokemon', 'swamp', 'dojo', 'haunted', 'ruins', 'beach', 'fishing-pokemon', 'ocean', 'desert', 'volcanic', 'tundra', 'industrial'];
const PROMOTION_SECTIONS = ['mountain', 'lake'];
const ALL_PLACE_SECTIONS = [...PLACE_BUILD_SECTIONS.slice(0, 2), 'cave-pokemon', ...PLACE_BUILD_SECTIONS.slice(3)]; // order irrelevant; kept simple

// Archetype memberships (to know who is ALREADY in a place archetype,
// including the not-yet-promoted mountain/lake lists).
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
  if (!target) continue; // structural/gift/needs-review — no place target
  const covPlaces = r.currentlyCovered.filter((s) => PLACE_BUILD_SECTIONS.includes(s));
  const covNonPlace = r.currentlyCovered.filter((s) => !PLACE_BUILD_SECTIONS.includes(s));

  if (r.currentlyCovered.length === 0) {
    // Not on the build page at all.
    if (inArchetype(r, target)) continue; // already curated in mountain/lake — promotion covers it
    // Flag lines already curated into a (not-yet-promoted) mountain/lake
    // archetype with a DIFFERENT recommendation — pick one, not both.
    const conflict = PROMOTION_SECTIONS.find((s) => inArchetype(r, s));
    news.push({ r, target, conflict });
    continue;
  }

  if (covPlaces.length >= 2) {
    // MECE check is member-aware: the same line sitting in two sections via
    // DIFFERENT members (base Corsola in ocean, Galarian Cursola in haunted)
    // is a legitimate regional-form split, not an overlap — a member id must
    // appear in BOTH sections to count as a true violation.
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
const bySection = (list, key) => {
  const m = new Map();
  for (const e of list) {
    const s = e[key];
    if (!m.has(s)) m.set(s, []);
    m.get(s).push(e);
  }
  return m;
};

// ---- Unified change table: ordered by proposed section, then confidence.
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
  if (formSplit) continue; // legitimate regional-form split — no change proposed
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

writeFileSync(join(OUT_DIR, 'proposed-changes.md'), md.join('\n'));
console.log(md.join('\n'));
