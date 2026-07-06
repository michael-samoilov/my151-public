// Biome assignment pipeline: for every evolution line in src/data/pokemon.json,
// derive the best-fit build-page "place" section from real encounter data
// (Gens I–VI from docs/biome-research/pokemon_encounters_gen1-8.csv; Gens
// VII–VIII from the PokeAPI CSV dumps fetched by fetch-pokeapi.mjs), grade the
// confidence of that assignment, tag no-data lines from official structural
// metadata (legendary/starter/fossil/…), and fall back to a curated,
// clearly-tagged knowledge file for SV/Kitakami-only wild lines.
//
// Output (report-only — this pipeline does NOT modify app data):
//   docs/biome-research/output/biome-assignments.json
//   docs/biome-research/output/biome-report.md
//
// Run:  node scripts/biome/fetch-pokeapi.mjs && node scripts/biome/build-assignments.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESEARCH = join(ROOT, 'docs', 'biome-research');
const POKEAPI = join(RESEARCH, 'pokeapi');
const OUT_DIR = join(RESEARCH, 'output');
const SCRIPT_DIR = join(ROOT, 'scripts', 'biome');

// ---------------------------------------------------------------- CSV parsing

/** Quote-aware CSV line splitter (handles `"south, towards Jubilife City"`). */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(path) {
  return readFileSync(path, 'utf8').trim().split('\n').slice(1).map(splitCsvLine);
}

// ------------------------------------------------------------------ Constants

/** Our 16 build-page place sections (biome tag → archetype id). */
const SECTION_BY_TAG = {
  forest: 'forest', meadow: 'meadow', cave: 'cave-pokemon', mountain: 'mountain',
  swamp: 'swamp', lake: 'lake', dojo: 'dojo', haunted: 'haunted', ruins: 'ruins',
  beach: 'beach', fishing: 'fishing-pokemon', ocean: 'ocean', desert: 'desert',
  volcanic: 'volcanic', tundra: 'tundra', industrial: 'industrial',
};
// 'water' is an internal pseudo-tag for surf contexts whose location has no
// explicit watery tag (city canals, route ponds, unlabelled sea) — it is
// redistributed per line to ocean/lake after aggregation (see resolveWater).
const VALID_TAGS = new Set([...Object.keys(SECTION_BY_TAG), 'urban', 'special', 'water']);
const WATERY = new Set(['ocean', 'lake', 'beach', 'swamp']);

// Version ids (PokeAPI) for the Gen VII/VIII merge.
const GEN78_VIDS = new Set(['27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '50', '51']);

// Confidence thresholds (calibrated against the spot checks at the bottom).
const HIGH = { share: 0.55, games: 3, margin: 1.5 };
const MED = { share: 0.35, games: 2 };

// ------------------------------------------------- Method → biome vote rules

/**
 * Returns { tags: string[], acquisition?: 'gift'|'static' } for one encounter
 * row. `locTags` are the location's biome tags; `locName` aids the surf rule.
 */
function votesFor(method, locTags, locName) {
  const m = method.toLowerCase();
  // Terrain-descriptor methods carried by the gen1-6 CSV ("meadow|forest",
  // "mountain", "cave|volcanic") — the method string IS the biome.
  if (m.split('|').every((t) => VALID_TAGS.has(t))) return { tags: m.split('|') };
  if (/^(yellow|purple|red)-flowers$/.test(m)) return { tags: ['meadow'] };
  if (m === 'rough-terrain') return { tags: ['mountain'] };
  if (/rod|feebas-tile-fishing/.test(m)) return { tags: ['fishing'] };
  if (m === 'rock-smash') return { tags: ['cave'] };
  if (m === 'cave-spots') return { tags: ['cave'] };
  if (m === 'bridge-spots') return { tags: [] };
  if (/^(surf|surf-spots|overworld-water|wanderer-water|seaweed|bubbling-spots|sos-from-bubbling-spot|roaming-water)$/.test(m)) {
    const water = locTags.filter((t) => WATERY.has(t));
    if (water.length) return { tags: water };
    if (/sea route|\bsea\b|\bbay\b|shoal|undella|ocean/i.test(locName)) return { tags: ['ocean'] };
    // Surfing on a location with no watery tag = some body of water whose
    // salt/freshwater nature we can't tell from the location alone (route
    // ponds, city canals). Vote the 'water' pseudo-tag; it's redistributed to
    // ocean/lake per line based on the line's explicit water evidence.
    return { tags: ['water'] };
  }
  if (/^(gift|gift-egg|npc-trade)$/.test(m)) return { tags: [], acquisition: 'gift' };
  if (m === 'only-one' || m === 'pokeflute' || m === 'squirt-bottle' || m === 'wailmer-pail' || m === 'devon-scope') {
    return { tags: locTags, acquisition: 'static' };
  }
  // walk, dark-grass, grass-spots, sos-encounter, horde, headbutt*, berry-trees,
  // honey-tree, hidden-grotto, overworld*, wanderer, roaming-grass, island-scan …
  return { tags: locTags };
}

// ------------------------------------------------------- Species stat holder

// Each biome tag gets FULL credit for every distinct (game, location) context —
// no fractional split across a location's multiple tags. Exclusivity (`share`)
// is then tagContexts / totalContexts: "in X% of the line's distinct wild
// appearances, the place is <tag>". (A fractional split was tried first and
// systematically punished species whose core habitat carries several tags —
// e.g. Mt. Silver is cave|mountain|tundra, which diluted Larvitar's mountain
// signal below a four-game Unova meadow route.)
const speciesStats = new Map(); // speciesId -> { tags: Map(tag -> {contexts:Set, games:Set, regions:Set, locs:Set}), contexts:Set, acquisitions:Set }

function statFor(id) {
  if (!speciesStats.has(id)) {
    speciesStats.set(id, { tags: new Map(), contexts: new Set(), acquisitions: new Set() });
  }
  return speciesStats.get(id);
}

function addVotes(speciesId, game, region, locKey, tags, acquisition) {
  const s = statFor(speciesId);
  if (acquisition) s.acquisitions.add(acquisition);
  const useful = tags.filter((t) => t !== 'special' && VALID_TAGS.has(t));
  if (!useful.length) return;
  const ctx = `${game}|${locKey}`;
  s.contexts.add(ctx);
  for (const tag of useful) {
    if (!s.tags.has(tag)) s.tags.set(tag, { contexts: new Set(), games: new Set(), regions: new Set(), locs: new Set() });
    const t = s.tags.get(tag);
    t.contexts.add(ctx);
    t.games.add(game);
    t.regions.add(region);
    t.locs.add(locKey);
  }
}

// -------------------------------------------------- 1. Local gen1–6 dataset

// Also build (region|location-name) → tags so LGPE-Kanto can inherit the same
// hand classification the Gen-I locations already received.
const localNameTags = new Map();
let localRows = 0;
let localEmptyBiomeRows = 0;

for (const r of readCsv(join(RESEARCH, 'pokemon_encounters_gen1-8.csv'))) {
  if (r.length !== 14) continue; // header glitches; quote-aware parser leaves none in practice
  const [, idStr, , locName, , , region, biomes, method, game] = r;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) continue;
  localRows++;
  const locTags = biomes ? biomes.split('|').filter((t) => VALID_TAGS.has(t)) : [];
  if (!biomes) localEmptyBiomeRows++;
  if (locTags.length) {
    const key = `${region}|${locName.toLowerCase()}`;
    if (!localNameTags.has(key)) localNameTags.set(key, locTags);
  }
  const { tags, acquisition } = votesFor(method, locTags, locName);
  addVotes(id, game, region, `${region}|${locName}`, tags, acquisition);
}

// ------------------------------------------------ 2. PokeAPI gen7/8 dataset

const paRows = (f) => readCsv(join(POKEAPI, f));
const paAreas = new Map(paRows('location_areas.csv').map((r) => [r[0], r[1]]));
const paLocs = new Map(paRows('locations.csv').map((r) => [r[0], { regionId: r[1], ident: r[2] }]));
const paRegions = new Map(paRows('regions.csv').map((r) => [r[0], r[1]]));
const paVersions = new Map(paRows('versions.csv').map((r) => [r[0], r[2]]));
const paMethods = new Map(paRows('encounter_methods.csv').map((r) => [r[0], r[1].trim()]));
const paSlotMethod = new Map(paRows('encounter_slots.csv').map((r) => [r[0], r[2]])); // slot id -> method id
const paFormSpecies = new Map(paRows('pokemon.csv').map((r) => [r[0], Number(r[2])])); // pokemon id -> species id
const paLocNames = new Map(); // location id -> english display name
for (const r of paRows('location_names.csv')) if (r[1] === '9') paLocNames.set(r[0], r[2]);

const gen78LocTags = JSON.parse(readFileSync(join(SCRIPT_DIR, 'location-biomes.gen78.json'), 'utf8'));

const unclassifiedLocs = new Map(); // locId -> {name, region, rows}
let gen78Rows = 0;

for (const r of paRows('encounters.csv')) {
  const [, vid, areaId, slotId, pokeIdStr] = r;
  if (!GEN78_VIDS.has(vid)) continue;
  gen78Rows++;
  const locId = paAreas.get(areaId);
  const loc = paLocs.get(locId);
  if (!loc) continue;
  const region = paRegions.get(loc.regionId) ?? '?';
  const dispName = paLocNames.get(locId) ?? loc.ident;
  const speciesId = paFormSpecies.get(pokeIdStr) ?? Number(pokeIdStr);

  // Location tags: LGPE-Kanto inherits the local CSV's classification by
  // display name; everything else uses the curated gen7/8 map.
  let locTags = null;
  if (region === 'kanto') {
    locTags = localNameTags.get(`Kanto|${dispName.toLowerCase()}`) ?? null;
  }
  if (!locTags) locTags = gen78LocTags[locId] ?? null;
  if (!locTags) {
    const u = unclassifiedLocs.get(locId) ?? { name: dispName, region, rows: 0 };
    u.rows++;
    unclassifiedLocs.set(locId, u);
    locTags = [];
  }

  const method = paMethods.get(paSlotMethod.get(slotId)) ?? 'walk';
  const game = paVersions.get(vid) ?? `v${vid}`;
  const { tags, acquisition } = votesFor(method, locTags, dispName);
  addVotes(speciesId, game, region, `${region}|${dispName}`, tags, acquisition);
}

// --------------------------------------------- 3. App data + structural sets

const pokemon = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'pokemon.json'), 'utf8'));
const byId = new Map(pokemon.map((p) => [p.id, p]));

const categoriesSrc = readFileSync(join(ROOT, 'src', 'data', 'categories.ts'), 'utf8');
function idSet(name) {
  const m = categoriesSrc.match(new RegExp(`${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`));
  return new Set(m ? m[1].match(/\d+/g)?.map(Number) ?? [] : []);
}
const STARTERS = idSet('STARTER_IDS');
const FOSSILS = idSet('FOSSIL_IDS');
const PSEUDOS = idSet('PSEUDO_LEGENDARY_IDS');
const ULTRA_BEASTS = idSet('ULTRA_BEAST_IDS');
const PARADOX = idSet('PARADOX_IDS');
const CONVERGENT = idSet('CONVERGENT_IDS');

// Archetype id lists (for currentlyCovered): pair every `id: '…'` with the
// pokemonIds arrays that follow it (subgroup lists are subsets — union is safe).
const archetypesSrc = readFileSync(join(ROOT, 'src', 'data', 'archetypes.ts'), 'utf8');
const archetypeIds = new Map(); // archetype id -> Set<number>
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

// Build groups (which sections exist on the build page today).
const slotSrc = readFileSync(join(ROOT, 'src', 'data', 'slot-template.ts'), 'utf8');
const buildGroups = [...slotSrc.matchAll(/id:\s*'([\w-]+)'[^\n]*?filterType:\s*('archetype'|'category'|null)[^\n]*?filterId:\s*(?:'([\w-]+)'|null)/g)]
  .map((m) => ({ id: m[1], filterType: m[2]?.replaceAll("'", '') ?? null, filterId: m[3] ?? null }));

function coveredSectionsFor(ids) {
  const covered = [];
  for (const g of buildGroups) {
    if (g.filterType === 'archetype') {
      const set = archetypeIds.get(g.filterId);
      if (set && ids.some((id) => set.has(id))) covered.push(g.id);
    } else if (g.filterType === 'category') {
      const anyMatch = ids.some((id) => {
        const p = byId.get(id);
        if (!p) return false;
        switch (g.filterId) {
          case 'starter': return STARTERS.has(id);
          case 'fossil': return FOSSILS.has(id);
          case 'pseudo-legendary': return PSEUDOS.has(id);
          case 'legendary': return p.isLegendary;
          case 'mythical': return p.isMythical;
          default: return false;
        }
      });
      if (anyMatch) covered.push(g.id);
    }
  }
  return covered;
}

// ------------------------------------------------------ 4. Line aggregation

const lines = new Map(); // evolutionChainId -> members[]
for (const p of pokemon) {
  if (!lines.has(p.evolutionChainId)) lines.set(p.evolutionChainId, []);
  lines.get(p.evolutionChainId).push(p);
}

const knowledge = JSON.parse(readFileSync(join(SCRIPT_DIR, 'knowledge-fill.json'), 'utf8')).entries;
const knowledgeByName = new Map(knowledge.map((e) => [e.species, e]));

function structuralTagFor(members) {
  const ids = members.map((m) => m.id);
  // Most-specific first: UBs and paradox mons carry isLegendary too, so the
  // generic legendary check must come after them.
  if (ids.some((id) => ULTRA_BEASTS.has(id))) return 'ultra-beast';
  if (ids.some((id) => PARADOX.has(id))) return 'paradox';
  if (members.some((m) => m.isMythical)) return 'mythical';
  if (members.some((m) => m.isLegendary)) return 'legendary';
  if (ids.some((id) => STARTERS.has(id))) return 'starter';
  if (ids.some((id) => FOSSILS.has(id))) return 'fossil';
  if (ids.some((id) => CONVERGENT.has(id))) return 'convergent';
  if (members.every((m) => m.isBaby)) return 'baby-only';
  return null;
}

const records = [];
for (const [chainId, members] of lines) {
  members.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
  const base = members.find((m) => m.id < 10000) ?? members[0];
  const ids = members.map((m) => m.id);

  // Union member stats.
  const agg = new Map(); // tag -> {contexts:Set, games:Set, regions:Set, locs:Set}
  const allContexts = new Set();
  const acquisitions = new Set();
  for (const id of ids) {
    const s = speciesStats.get(id);
    if (!s) continue;
    for (const a of s.acquisitions) acquisitions.add(a);
    for (const c of s.contexts) allContexts.add(c);
    for (const [tag, t] of s.tags) {
      if (!agg.has(tag)) agg.set(tag, { contexts: new Set(), games: new Set(), regions: new Set(), locs: new Set() });
      const a = agg.get(tag);
      for (const c of t.contexts) a.contexts.add(c);
      for (const g of t.games) a.games.add(g);
      for (const rg of t.regions) a.regions.add(rg);
      for (const l of t.locs) a.locs.add(l);
    }
  }

  // Redistribute the 'water' pseudo-tag: ambiguous surf contexts count toward
  // whichever of ocean/lake the line has more EXPLICIT evidence for (sea-route
  // and sea-location votes vs lake-tagged votes); no explicit evidence → lake
  // (inland default). Set-merging dedupes contexts already counted explicitly.
  if (agg.has('water')) {
    const w = agg.get('water');
    agg.delete('water');
    const oceanN = agg.get('ocean')?.contexts.size ?? 0;
    const lakeN = agg.get('lake')?.contexts.size ?? 0;
    const target = oceanN > lakeN ? 'ocean' : 'lake';
    if (!agg.has(target)) agg.set(target, { contexts: new Set(), games: new Set(), regions: new Set(), locs: new Set() });
    const t = agg.get(target);
    for (const c of w.contexts) t.contexts.add(c);
    for (const g of w.games) t.games.add(g);
    for (const rg of w.regions) t.regions.add(rg);
    for (const l of w.locs) t.locs.add(l);
  }

  const totalContexts = allContexts.size;
  const scored = [...agg.entries()]
    .map(([tag, t]) => ({
      tag,
      share: totalContexts ? t.contexts.size / totalContexts : 0,
      games: t.games.size,
      regions: t.regions.size,
      locations: t.locs.size,
    }))
    .sort((a, b) => b.share - a.share || b.games - a.games);

  const structural = structuralTagFor(members);
  let recommended = null;
  let confidence = null;
  let source = null;
  let rationale = '';

  if (scored.length && structural && totalContexts <= 2) {
    // A category mon (legendary/mythical/starter/…) with only a trace of
    // encounter data (e.g. Magearna's single gift-city row): the structural
    // identity is the better recommendation than one thin biome vote.
    recommended = structural;
    source = 'structural';
    confidence = 'high';
    rationale = `${structural} per official metadata; encounter evidence too thin to override (${totalContexts} context(s))`;
  } else if (scored.length) {
    const top = scored[0];
    const second = scored[1];
    const margin = second ? top.share / Math.max(second.share, 1e-9) : Infinity;
    recommended = top.tag;
    source = 'encounters';
    if (top.share >= HIGH.share && top.games >= HIGH.games && margin >= HIGH.margin) confidence = 'high';
    else if (top.share >= MED.share && top.games >= MED.games) confidence = 'medium';
    else confidence = 'low';
    rationale = `${top.tag} in ${Math.round(top.share * 100)}% of its distinct wild appearances (${top.games} game(s), ${top.regions} region(s), ${top.locations} location(s))` +
      (second ? `; runner-up ${second.tag} at ${Math.round(second.share * 100)}%` : '');
  } else if (structural) {
    recommended = structural;
    source = 'structural';
    confidence = 'high';
    rationale = `no wild encounter rows; line is ${structural} per official metadata`;
  } else {
    const k = members.map((m) => knowledgeByName.get(m.name)).find(Boolean);
    if (k) {
      recommended = k.biome;
      source = 'knowledge';
      confidence = k.confidence === 'medium' ? 'medium' : 'low';
      rationale = `no reachable encounter dataset (SV/DLC); curated from official spawn areas: ${k.note}`;
    } else if (acquisitions.has('gift')) {
      recommended = 'gift';
      source = 'structural';
      confidence = 'medium';
      rationale = 'only obtainable as a gift in the covered games';
    } else {
      recommended = 'unresolved';
      source = 'none';
      confidence = null;
      rationale = 'no encounter rows, no structural tag, no curated knowledge entry';
    }
  }

  records.push({
    chainId,
    line: members.filter((m) => m.id < 10000).map((m) => m.name).join(' → ') || base.name,
    members: ids,
    baseId: base.id,
    generation: base.generation,
    recommended,
    recommendedSection: SECTION_BY_TAG[recommended] ?? null,
    confidence,
    source,
    structuralTags: structural ? [structural] : [],
    acquisitions: [...acquisitions],
    rationale,
    scores: scored.slice(0, 5).map((s) => ({ ...s, share: +s.share.toFixed(3) })),
    currentlyCovered: coveredSectionsFor(ids),
  });
}

records.sort((a, b) => a.baseId - b.baseId);

// -------------------------------------------------------------- 5. Outputs

mkdirSync(OUT_DIR, { recursive: true });

// Completeness check.
const seenIds = new Set(records.flatMap((r) => r.members));
const missing = [];
for (let i = 1; i <= 1025; i++) if (!seenIds.has(i)) missing.push(i);

const speciesWithData = [...speciesStats.entries()].filter(([id, s]) => id <= 1025 && s.tags.size).length;

// Validation spot checks.
const spot = (name) => {
  const r = records.find((x) => x.members.some((id) => byId.get(id)?.name === name));
  return r ? `${name}: → ${r.recommended} (${r.confidence ?? '-'}, ${r.source}) — ${r.rationale}` : `${name}: NOT FOUND`;
};
const spotChecks = ['zubat', 'tentacool', 'magikarp', 'larvitar', 'cetoddle', 'lechonk', 'snorlax', 'eevee', 'scyther'].map(spot);

const summary = {
  generatedBy: 'scripts/biome/build-assignments.mjs',
  totals: {
    lines: records.length,
    baseDexPokemon: 1025,
    missingFromLines: missing,
    speciesWithEncounterData: speciesWithData,
    localGen16Rows: localRows,
    localEmptyBiomeRowShare: +(localEmptyBiomeRows / localRows).toFixed(3),
    pokeapiGen78Rows: gen78Rows,
    unclassifiedGen78Locations: unclassifiedLocs.size,
  },
  bySource: Object.fromEntries(['encounters', 'structural', 'knowledge', 'none'].map((s) => [s, records.filter((r) => r.source === s).length])),
  byConfidence: Object.fromEntries(['high', 'medium', 'low', null].map((c) => [String(c), records.filter((r) => r.confidence === c).length])),
};

writeFileSync(join(OUT_DIR, 'biome-assignments.json'), JSON.stringify({ summary, records }, null, 1));

// ----- Markdown report -----
const SECTION_ORDER = ['forest', 'meadow', 'cave', 'mountain', 'swamp', 'lake', 'dojo', 'haunted', 'ruins', 'beach', 'fishing', 'ocean', 'desert', 'volcanic', 'tundra', 'industrial'];
const md = [];
md.push('# Biome assignment report');
md.push('');
md.push(`Generated by \`scripts/biome/build-assignments.mjs\`. Report-only — no app data was modified.`);
md.push('');
md.push('## Summary');
md.push('');
md.push(`- Evo lines assessed: **${records.length}** (covering all base-dex ids 1–1025${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''})`);
md.push(`- Species with real encounter data: **${speciesWithData}** / 1025 (Gens I–VI local + Gens VII–VIII PokeAPI)`);
md.push(`- Assignment source: ${Object.entries(summary.bySource).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
md.push(`- Confidence: ${Object.entries(summary.byConfidence).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
md.push('');

const fmtLine = (r) => {
  const cov = r.currentlyCovered.length ? r.currentlyCovered.join(', ') : '**UNCOVERED**';
  const top = r.scores[0];
  const metrics = r.source === 'encounters' && top ? `${Math.round(top.share * 100)}% · ${top.games}g · ${top.regions}r` : r.source;
  return `| ${r.line} | ${r.confidence ?? '—'} | ${metrics} | ${cov} |`;
};

md.push('## Recommended additions per place section');
md.push('');
md.push('Lines are sorted uncovered-first, then by confidence. “Currently in” lists the build sections that already contain a member (overlap awareness).');
for (const tag of SECTION_ORDER) {
  const rs = records.filter((r) => r.recommended === tag);
  if (!rs.length) continue;
  rs.sort((a, b) => (a.currentlyCovered.length ? 1 : 0) - (b.currentlyCovered.length ? 1 : 0) ||
    ['high', 'medium', 'low'].indexOf(a.confidence) - ['high', 'medium', 'low'].indexOf(b.confidence) ||
    (b.scores[0]?.share ?? 0) - (a.scores[0]?.share ?? 0));
  const uncovered = rs.filter((r) => !r.currentlyCovered.length).length;
  md.push('');
  md.push(`### ${tag} → section \`${SECTION_BY_TAG[tag]}\` — ${rs.length} lines (${uncovered} uncovered)`);
  md.push('');
  md.push('| Line | Conf | Metrics | Currently in |');
  md.push('|---|---|---|---|');
  for (const r of rs) md.push(fmtLine(r));
}

md.push('');
md.push('## Mountain & Lake promotion viability');
md.push('');
for (const tag of ['mountain', 'lake']) {
  const rs = records.filter((r) => r.recommended === tag);
  const hi = rs.filter((r) => r.confidence === 'high').length;
  const med = rs.filter((r) => r.confidence === 'medium').length;
  md.push(`- **${tag}**: ${rs.length} candidate lines (${hi} high, ${med} medium confidence). Current archetype size: ${archetypeIds.get(tag === 'mountain' ? 'mountain' : 'lake')?.size ?? 0} ids.`);
}

md.push('');
md.push('## Proposed / non-place tags');
md.push('');
md.push('Tags that are not existing place sections. Structural tags (legendary, mythical, starter, fossil, ultra-beast, paradox) are already represented by category sections on the build page; `urban` and `gift` (and `convergent`) have no build section today and are candidates for new sections.');
const nonPlace = [...new Set(records.map((r) => r.recommended).filter((t) => t && !SECTION_BY_TAG[t] && t !== 'unresolved'))];
for (const tag of nonPlace.sort()) {
  const rs = records.filter((r) => r.recommended === tag);
  md.push('');
  md.push(`### ${tag} — ${rs.length} lines`);
  md.push('');
  md.push(rs.map((r) => `${r.line}${r.currentlyCovered.length ? '' : ' **(uncovered)**'}`).join(' · '));
}

md.push('');
md.push('## Unresolved lines (need an SV/LA data source or a curated entry)');
md.push('');
const unresolved = records.filter((r) => r.recommended === 'unresolved');
md.push(unresolved.length ? unresolved.map((r) => `- ${r.line} (gen ${r.generation})`).join('\n') : '_None._');

md.push('');
md.push('## Data quality appendix');
md.push('');
md.push(`- Local Gens I–VI rows: ${localRows} (${Math.round(summary.totals.localEmptyBiomeRowShare * 100)}% have an empty biome tag — mostly city/sea-route locations; surf/rod method rules recover fishing & ocean votes from them).`);
md.push(`- PokeAPI Gens VII–VIII rows merged: ${gen78Rows}.`);
if (unclassifiedLocs.size) {
  md.push(`- **Unclassified Gen VII/VIII locations (${unclassifiedLocs.size})** — rows counted but contributed no biome votes:`);
  for (const [id, u] of [...unclassifiedLocs.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
    md.push(`  - ${id} ${u.name} (${u.region}) — ${u.rows} rows`);
  }
} else {
  md.push('- All Gen VII/VIII encounter locations classified.');
}
md.push('');
md.push('### Spot checks');
md.push('');
for (const s of spotChecks) md.push(`- ${s}`);
md.push('');

writeFileSync(join(OUT_DIR, 'biome-report.md'), md.join('\n'));

// Console summary.
console.log('=== biome pipeline summary ===');
console.log(JSON.stringify(summary, null, 2));
console.log('\n=== spot checks ===');
for (const s of spotChecks) console.log(' ', s);
if (unclassifiedLocs.size) {
  console.log(`\nWARNING: ${unclassifiedLocs.size} unclassified gen7/8 locations (see report appendix)`);
}
if (missing.length) console.log(`\nWARNING: base-dex ids missing from line records: ${missing.join(', ')}`);
console.log(`\nWrote ${join(OUT_DIR, 'biome-assignments.json')}`);
console.log(`Wrote ${join(OUT_DIR, 'biome-report.md')}`);
