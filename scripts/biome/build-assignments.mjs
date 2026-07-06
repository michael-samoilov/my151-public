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

// Version ids (PokeAPI) for the Gen VII/VIII merge. Let's Go (31/32) is
// deliberately EXCLUDED: its catch-combo rare-spawn system puts species like
// Dratini on ~20 routes at once (and PokeAPI encodes every LGPE slot at
// rarity 100), which is gimmick-spawn pollution rather than habitat identity —
// Kanto is already richly covered by RBY/FRLG/HGSS.
const GEN78_VIDS = new Set(['27', '28', '29', '30', '33', '34', '35', '36', '50', '51']);

// Confidence thresholds (calibrated against the spot checks at the bottom).
const HIGH = { share: 0.55, games: 3, margin: 1.5 };
const MED = { share: 0.35, games: 2 };

// RELATIVE rarity weighting: low rarity is NOT a counter-signal by itself —
// pseudo-legendaries and mons like Dreepy are 1-5% EVERYWHERE, and those rare
// slots ARE their canonical presence. A context is downweighted only when the
// line has substantially HIGHER rates elsewhere (rare here + common there =
// cameo). Weight is judged against the line's own best rarity.
function relativeRarityWeight(rarity, lineMaxRarity) {
  const rel = rarity / Math.max(lineMaxRarity, 1);
  if (rel >= 0.34) return 1;
  if (rel >= 0.1) return 0.5;
  return 0.2;
}

// Method-class weighting: gimmick mechanics are weaker evidence of habitat
// than core wild spawns regardless of rate. SOS chaining (call-for-help
// crossovers like Larvesta in Lush Jungle) and Island Scan (daily one-off
// out-of-region spawns) don't establish "this is where the line lives".
function methodClassWeight(method) {
  const m = method.toLowerCase();
  if (m === 'sos-encounter' || m === 'sos-from-bubbling-spot') return 0.3;
  // SM terrain-ambush spots (dust clouds / rustling / bubbling): one-off spawn
  // points PokeAPI encodes at rarity "100". Real presence, weak habitat claim —
  // and NOT water-specific (Diglett's are sand clouds), so they follow the
  // location's tags in votesFor rather than the water branch.
  if (m === 'bubbling-spots') return 0.3;
  if (m === 'island-scan') return 0.2;
  return 1;
}
// Evidence-strength gate: if a line's TOTAL weighted evidence is below this,
// the encounter data is too thin/rare to trust as a default placement — the
// line reroutes to structural/knowledge, or lands in the needs-review bucket.
// (Rare off-biome encounters are exactly the kind of thing that should be a
// user's own off-section pick, not an app default.)
const MIN_EVIDENCE_STRENGTH = 1.0;

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
  if (/^(surf|surf-spots|overworld-water|wanderer-water|seaweed|roaming-water)$/.test(m)) {
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

function addVotes(speciesId, game, region, locKey, tags, acquisition, rarity = 10, methodW = 1) {
  const s = statFor(speciesId);
  if (acquisition) s.acquisitions.add(acquisition);
  const useful = tags.filter((t) => t !== 'special' && VALID_TAGS.has(t));
  if (!useful.length) return;
  const ctx = `${game}|${locKey}`;
  s.contexts.add(ctx);
  // Track the BEST slot rarity and BEST method class seen per context —
  // repeated slots for the same place/game keep their max, so weighting
  // reflects the most accessible way to find the Pokémon there.
  if (!s.ctxRarity) s.ctxRarity = new Map();
  if (!s.ctxMethodW) s.ctxMethodW = new Map();
  s.ctxRarity.set(ctx, Math.max(s.ctxRarity.get(ctx) ?? 0, rarity));
  s.ctxMethodW.set(ctx, Math.max(s.ctxMethodW.get(ctx) ?? 0, methodW));
  for (const tag of useful) {
    if (!s.tags.has(tag)) s.tags.set(tag, { contexts: new Set(), games: new Set(), regions: new Set(), locs: new Set(), locGames: new Map(), ctxRarity: new Map(), locRarity: new Map(), ctxMethodW: new Map() });
    const t = s.tags.get(tag);
    t.contexts.add(ctx);
    t.games.add(game);
    t.regions.add(region);
    t.locs.add(locKey);
    t.ctxRarity.set(ctx, Math.max(t.ctxRarity.get(ctx) ?? 0, rarity));
    t.ctxMethodW.set(ctx, Math.max(t.ctxMethodW.get(ctx) ?? 0, methodW));
    t.locRarity.set(locKey, Math.max(t.locRarity.get(locKey) ?? 0, rarity));
    if (!t.locGames.has(locKey)) t.locGames.set(locKey, new Set());
    t.locGames.get(locKey).add(game);
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
  const rarity = Number(r[13]) || 10;
  addVotes(id, game, region, `${region}|${locName}`, tags, acquisition, rarity, methodClassWeight(method));
}

// ------------------------------------------------ 2. PokeAPI gen7/8 dataset

const paRows = (f) => readCsv(join(POKEAPI, f));
const paAreas = new Map(paRows('location_areas.csv').map((r) => [r[0], r[1]]));
const paLocs = new Map(paRows('locations.csv').map((r) => [r[0], { regionId: r[1], ident: r[2] }]));
const paRegions = new Map(paRows('regions.csv').map((r) => [r[0], r[1]]));
const paVersions = new Map(paRows('versions.csv').map((r) => [r[0], r[2]]));
const paMethods = new Map(paRows('encounter_methods.csv').map((r) => [r[0], r[1].trim()]));
const paSlots = new Map(paRows('encounter_slots.csv').map((r) => [r[0], { methodId: r[2], rarity: Number(r[4]) || 10 }])); // slot id -> method + slot rarity
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

  const slot = paSlots.get(slotId);
  const method = paMethods.get(slot?.methodId) ?? 'walk';
  const game = paVersions.get(vid) ?? `v${vid}`;
  const { tags, acquisition } = votesFor(method, locTags, dispName);
  addVotes(speciesId, game, region, `${region}|${dispName}`, tags, acquisition, slot?.rarity ?? 10, methodClassWeight(method));
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
const overrides = JSON.parse(readFileSync(join(SCRIPT_DIR, 'overrides.json'), 'utf8')).entries;
const overrideByName = new Map(overrides.map((e) => [e.species, e]));

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

// ---- Pass A: aggregate stats per line (no decisions yet — the specificity
// weights below need the full distribution first).
const prelims = [];
for (const [chainId, members] of lines) {
  members.sort((a, b) => a.evolutionStage - b.evolutionStage || a.id - b.id);
  const base = members.find((m) => m.id < 10000) ?? members[0];
  const ids = members.map((m) => m.id);

  // Union member stats.
  const agg = new Map(); // tag -> {contexts:Set, games:Set, regions:Set, locs:Set, locGames:Map, ctxRarity:Map, locRarity:Map, ctxMethodW:Map}
  const allCtxRarity = new Map(); // ctx -> best rarity across members/tags
  const allCtxMethodW = new Map(); // ctx -> best method-class weight
  const acquisitions = new Set();
  const mergeTag = (a, t) => {
    for (const c of t.contexts) a.contexts.add(c);
    for (const g of t.games) a.games.add(g);
    for (const rg of t.regions) a.regions.add(rg);
    for (const l of t.locs) a.locs.add(l);
    for (const [loc, games] of t.locGames) {
      if (!a.locGames.has(loc)) a.locGames.set(loc, new Set());
      for (const g of games) a.locGames.get(loc).add(g);
    }
    for (const [c, r] of t.ctxRarity) a.ctxRarity.set(c, Math.max(a.ctxRarity.get(c) ?? 0, r));
    for (const [c, w] of t.ctxMethodW) a.ctxMethodW.set(c, Math.max(a.ctxMethodW.get(c) ?? 0, w));
    for (const [l, r] of t.locRarity) a.locRarity.set(l, Math.max(a.locRarity.get(l) ?? 0, r));
  };
  const emptyTag = () => ({ contexts: new Set(), games: new Set(), regions: new Set(), locs: new Set(), locGames: new Map(), ctxRarity: new Map(), locRarity: new Map(), ctxMethodW: new Map() });
  for (const id of ids) {
    const s = speciesStats.get(id);
    if (!s) continue;
    for (const a of s.acquisitions) acquisitions.add(a);
    for (const [c, r] of s.ctxRarity ?? []) allCtxRarity.set(c, Math.max(allCtxRarity.get(c) ?? 0, r));
    for (const [c, w] of s.ctxMethodW ?? []) allCtxMethodW.set(c, Math.max(allCtxMethodW.get(c) ?? 0, w));
    for (const [tag, t] of s.tags) {
      if (!agg.has(tag)) agg.set(tag, emptyTag());
      mergeTag(agg.get(tag), t);
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
    if (!agg.has(target)) agg.set(target, emptyTag());
    mergeTag(agg.get(target), w);
  }

  // Weighted exclusivity: each context contributes (relative-rarity weight ×
  // method-class weight). Relative means judged against the LINE's own best
  // rarity — a rare-everywhere line (Dreepy, pseudo-legendaries) keeps full
  // weight on its rare slots; only "rare here, common elsewhere" is a cameo.
  const lineMaxRarity = Math.max(0, ...allCtxRarity.values());
  const ctxWeight = (ctx, ctxRarity, ctxMethodW) =>
    relativeRarityWeight(ctxRarity.get(ctx) ?? 10, lineMaxRarity) * (ctxMethodW.get(ctx) ?? 1);
  const strengthOf = (ctxRarity, ctxMethodW) =>
    [...ctxRarity.keys()].reduce((s, ctx) => s + ctxWeight(ctx, ctxRarity, ctxMethodW), 0);
  const totalContexts = allCtxRarity.size;
  const totalStrength = strengthOf(allCtxRarity, allCtxMethodW);
  const scored = [...agg.entries()]
    .map(([tag, t]) => ({
      tag,
      share: totalStrength ? strengthOf(t.ctxRarity, t.ctxMethodW) / totalStrength : 0,
      strength: +strengthOf(t.ctxRarity, t.ctxMethodW).toFixed(2),
      maxRarity: Math.max(0, ...t.ctxRarity.values()),
      games: t.games.size,
      regions: t.regions.size,
      locations: t.locs.size,
    }))
    .sort((a, b) => b.share - a.share || b.games - a.games);

  const structural = structuralTagFor(members);
  const knowledgeEntry = members.map((m) => knowledgeByName.get(m.name)).find(Boolean);

  prelims.push({ chainId, members, base, ids, agg, scored, totalContexts, totalStrength, structural, knowledgeEntry, acquisitions });
}

// ---- Tag specificity (IDF): "meadow" is the background tag of nearly every
// grass route, so raw share lets it absorb identity mons (Sandshrew, Grimer).
// Weight each tag by how UNCOMMON meaningful presence of it is across all
// lines — a desert vote says far more than a meadow vote. Clamped so ultra-
// rare tags (dojo ≈ one location) can't hijack every line that passes by.
const IDF_ALPHA = 1.5;
const dfByTag = new Map();
const dataLines = prelims.filter((p) => p.scored.length).length;
for (const p of prelims) {
  for (const s of p.scored) if (s.share >= 0.10) dfByTag.set(s.tag, (dfByTag.get(s.tag) ?? 0) + 1);
}
const idfOf = (tag) => {
  const df = dfByTag.get(tag) ?? 1;
  return Math.min(3, Math.max(1, Math.log2(1 + dataLines / df)));
};

// ---- Pass B: decide each line's recommendation.
const records = [];
for (const P of prelims) {
  const { chainId, members, base, ids, agg, scored, totalContexts, totalStrength, structural, knowledgeEntry, acquisitions } = P;

  // Specificity-adjusted ranking (raw shares are kept for confidence gates
  // and reporting — the IDF only decides WHICH tag wins), with three guards
  // that keep the boost an arbiter of CONTESTED races, not a hijack vector:
  //
  // 1. DOMINANCE: a raw leader with share ≥ 0.5 and ≥ 1.8× the runner-up wins
  //    outright — no boost may overturn it (Skarmory's 63% mountain must not
  //    lose to a boosted 27% volcanic).
  // 2. BREADTH: a tag needs ≥2 locations and ≥2 games to earn its boost (one
  //    odd location must not hijack a broad line), AND its share must be
  //    competitive (≥ leader/3) — a fringe tag can't boost past everyone.
  // 3. INDEPENDENCE: no boost if the tag's contexts are ≈a subset (≥90%
  //    overlap) of the raw leader's — co-tagged locations (Kanto Routes 12/16
  //    are meadow|swamp) are the SAME evidence, not independent support for
  //    the more specific tag.
  const rawLeaderScored = scored[0];
  const leaderCtx = rawLeaderScored ? agg.get(rawLeaderScored.tag)?.ctxRarity : null;
  const dominant = rawLeaderScored && scored[1]
    ? rawLeaderScored.share >= 0.5 && rawLeaderScored.share >= 1.8 * scored[1].share
    : Boolean(rawLeaderScored);
  const ranked = scored
    .map((s) => {
      let boostEligible = !dominant && s.locations >= 2 && s.games >= 2 &&
        rawLeaderScored && s.share >= rawLeaderScored.share / 3;
      if (boostEligible && s.tag !== rawLeaderScored.tag && leaderCtx) {
        const own = agg.get(s.tag)?.ctxRarity;
        if (own) {
          let overlap = 0;
          for (const c of own.keys()) if (leaderCtx.has(c)) overlap++;
          if (overlap / own.size >= 0.9) boostEligible = false;
        }
      }
      return { ...s, score: s.share * (boostEligible ? Math.pow(idfOf(s.tag), IDF_ALPHA) : 1) };
    })
    // On an effective tie, prefer the more SPECIFIC tag — but only when the
    // two tags rest on substantially different contexts (Stonjourner's Route
    // 10 tundra vs Lake of Outrage mountain). If one side's contexts are just
    // a subset of the other's (co-tagged meadow|swamp routes: Snorlax), the
    // "specific" reading has no independent evidence — prefer the generic.
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) >= 0.01) return b.score - a.score;
      const aCtx = agg.get(a.tag)?.ctxRarity;
      const bCtx = agg.get(b.tag)?.ctxRarity;
      if (aCtx && bCtx) {
        let aInB = 0;
        let bInA = 0;
        for (const c of aCtx.keys()) if (bCtx.has(c)) aInB++;
        for (const c of bCtx.keys()) if (aCtx.has(c)) bInA++;
        const aSubset = aInB / aCtx.size >= 0.9;
        const bSubset = bInA / bCtx.size >= 0.9;
        if (aSubset && !bSubset) return 1; // a is derivative evidence — b first
        if (bSubset && !aSubset) return -1;
        if (aSubset && bSubset) return idfOf(a.tag) - idfOf(b.tag); // same evidence → generic first
      }
      return idfOf(b.tag) - idfOf(a.tag) || b.share - a.share || b.games - a.games;
    });

  // Weak evidence = the line's TOTAL rarity-weighted presence is under the
  // gate (Larvesta's whole record was two 1% Lush Jungle slots). The 1-2
  // context test only reroutes lines that have a structural/curated identity
  // to fall back on — 2 full-rate contexts (Burmy's honey trees) are enough
  // to place when nothing contradicts them.
  const weakEvidence = scored.length > 0 && totalStrength < MIN_EVIDENCE_STRENGTH;
  const thinContexts = scored.length > 0 && totalContexts <= 2;
  let recommended = null;
  let confidence = null;
  let source = null;
  let rationale = '';

  if ((weakEvidence || thinContexts) && structural) {
    // A category mon (legendary/mythical/starter/…) with only a trace of
    // encounter data (e.g. Magearna's single gift-city row): the structural
    // identity is the better recommendation than one thin biome vote.
    recommended = structural;
    source = 'structural';
    confidence = 'high';
    rationale = `${structural} per official metadata; encounter evidence too weak to override (${totalContexts} context(s), strength ${totalStrength.toFixed(1)})`;
  } else if ((weakEvidence || thinContexts) && knowledgeEntry) {
    // Curated knowledge beats a handful of rare slots (the marquee habitat is
    // often a static encounter that wild-encounter tables never contained).
    recommended = knowledgeEntry.biome;
    source = 'knowledge';
    confidence = knowledgeEntry.confidence === 'medium' ? 'medium' : 'low';
    rationale = `encounter evidence too weak to trust (${totalContexts} context(s), strength ${totalStrength.toFixed(1)}); curated: ${knowledgeEntry.note}`;
  } else if (weakEvidence) {
    // Real data exists but it's all rare/thin — flag for human review instead
    // of confidently placing. The weak evidence stays attached for context.
    recommended = 'needs-review';
    source = 'encounters-weak';
    confidence = null;
    rationale = `evidence too weak for a default placement: ${totalContexts} context(s), strength ${totalStrength.toFixed(1)} < ${MIN_EVIDENCE_STRENGTH}; top tag would be ${ranked[0].tag} (${Math.round(ranked[0].share * 100)}%)`;
  } else if (scored.length) {
    const top = ranked[0];
    const second = ranked[1];
    const margin = second ? top.score / Math.max(second.score, 1e-9) : Infinity;
    recommended = top.tag;
    source = 'encounters';
    if (top.share >= HIGH.share && top.games >= HIGH.games && margin >= HIGH.margin) confidence = 'high';
    else if (top.share >= MED.share && top.games >= MED.games) confidence = 'medium';
    else confidence = 'low';
    const rawLeader = scored[0];
    rationale = `${top.tag} in ${Math.round(top.share * 100)}% of its distinct wild appearances (${top.games} game(s), ${top.regions} region(s), ${top.locations} location(s))` +
      (second ? `; runner-up ${second.tag} at ${Math.round(second.share * 100)}%` : '') +
      (rawLeader.tag !== top.tag ? `; preferred over generic ${rawLeader.tag} (${Math.round(rawLeader.share * 100)}%) for specificity` : '');
  } else if (structural) {
    recommended = structural;
    source = 'structural';
    confidence = 'high';
    rationale = `no wild encounter rows; line is ${structural} per official metadata`;
  } else {
    const k = knowledgeEntry;
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

  // Curated override — applied last and transparently (see overrides.json):
  // for lines where the data is systematically misleading and no general rule
  // fixes them without breaking others (e.g. Bagon's identity is Meteor
  // Falls, a single location that breadth rules can't reward).
  const overrideEntry = members.map((m) => overrideByName.get(m.name)).find(Boolean);
  if (overrideEntry && overrideEntry.biome !== recommended) {
    rationale = `curated override: ${overrideEntry.reason} — pipeline would have said ${recommended ?? 'nothing'} (${rationale})`;
    recommended = overrideEntry.biome;
    source = 'override';
    confidence = 'medium';
  }

  // Substantiating in-game locations for the recommended tag: every distinct
  // location that voted for it, with the games it appears in there. Sorted by
  // game-breadth (the strongest evidence first); capped in the JSON to keep
  // the file reviewable (Magikarp's fishing tag alone spans ~190 locations).
  const EVIDENCE_CAP = 40;
  let evidence = null;
  // Weak lines cite the evidence for their would-be top tag so reviewers can
  // see exactly what was rejected (e.g. Larvesta's 1% Lush Jungle slots).
  const evidenceTag = source === 'encounters' || source === 'override' ? recommended : source === 'encounters-weak' ? ranked[0]?.tag : null;
  if (evidenceTag && agg.has(evidenceTag)) {
    const t = agg.get(evidenceTag);
    const fmtLoc = (locKey) => {
      const [region, name] = locKey.split('|');
      const reg = region.charAt(0).toUpperCase() + region.slice(1);
      return { location: name, region: reg };
    };
    const all = [...t.locGames.entries()]
      .map(([locKey, games]) => ({ ...fmtLoc(locKey), games: [...games].sort(), bestRarity: t.locRarity.get(locKey) ?? null }))
      .sort((a, b) => b.games.length - a.games.length || a.location.localeCompare(b.location));
    evidence = { tag: evidenceTag, locations: all.slice(0, EVIDENCE_CAP), omittedLocations: Math.max(0, all.length - EVIDENCE_CAP) };
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
    scores: ranked.slice(0, 5).map((s) => ({ ...s, share: +s.share.toFixed(3), score: +s.score.toFixed(3) })),
    evidenceStrength: +totalStrength.toFixed(2),
    totalContexts,
    evidence,
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
  bySource: Object.fromEntries(['encounters', 'structural', 'knowledge', 'override', 'encounters-weak', 'none'].map((s) => [s, records.filter((r) => r.source === s).length])),
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
md.push('### Guardrails');
md.push('');
md.push("- **Relative rarity weighting** — low rarity is NOT a counter-signal by itself: pseudo-legendaries and mons like Dreepy are 1-5% everywhere, and those rare slots ARE their canonical presence. A context is downweighted only relative to the line's OWN best rate (rare here + common elsewhere = cameo).");
md.push('- **Method-class weighting** — gimmick mechanics (SOS call-chains, Island Scan) carry a fraction of the evidentiary weight of core wild spawns regardless of rate; an SOS-only record (Larvesta in Lush Jungle) does not establish habitat.');
md.push('- **Evidence-strength gate** — lines whose total weighted evidence is under 1.0 are never confidently placed: they fall back to structural identity or curated knowledge, or land in the needs-review bucket. (A chain-mechanic cameo is a user\'s off-section pick, not an app default — this is what re-routed Larvesta away from "forest".)');
md.push('- **Specificity (IDF) ranking with breadth eligibility** — generic tags (meadow is the background of nearly every grass route) are down-ranked against distinctive ones, but a tag needs ≥2 locations and ≥2 games to earn its boost, so one odd location cannot hijack a broad line. Effective ties prefer the more specific tag.');
md.push("- **Let's Go excluded** — LGPE's catch-combo rare-spawn system puts species on ~20 routes at once with no usable rates; Kanto is covered by RBY/FRLG/HGSS instead.");
md.push('- **Curated overrides** (`scripts/biome/overrides.json`) — a short, fully documented list for lines whose data is systematically misleading (e.g. Bagon\'s identity home is a single Meteor Falls room). Applied last, always disclosed in the rationale.');
md.push('- **Validation harness** (`scripts/biome/validate-assignments.mjs`) — 79 golden expectations a knowledgeable person can assert, plus red-flag detectors (rare-only, single-location, narrow-margin, minority-slice, curation-disagreement) whose output is `validation-report.md`.');
md.push('');

const fmtLine = (r) => {
  const cov = r.currentlyCovered.length ? r.currentlyCovered.join(', ') : '**UNCOVERED**';
  const top = r.scores[0];
  const metrics = r.source === 'encounters' && top ? `${Math.round(top.share * 100)}% · ${top.games}g · ${top.regions}r` : r.source;
  // Substantiating locations: encounter-derived rows cite the top in-game
  // locations (by game breadth); knowledge rows cite the curated note.
  let where = '—';
  if (r.evidence) {
    const SHOW = 5;
    const shown = r.evidence.locations.slice(0, SHOW)
      .map((l) => `${l.location} (${l.region}, ${l.games.length}g${l.bestRarity != null && l.bestRarity < 10 ? `, ≤${l.bestRarity}%` : ''})`)
      .join('; ');
    const more = r.evidence.locations.length - SHOW + r.evidence.omittedLocations;
    where = more > 0 ? `${shown}; +${more} more` : shown;
  } else if (r.source === 'knowledge') {
    where = r.rationale
      .replace(/^no reachable encounter dataset \(SV\/DLC\); curated from official spawn areas: /, 'SV/DLC (curated): ')
      .replace(/^encounter evidence too weak to trust \([^)]*\); curated: /, 'curated (weak data rejected): ');
  }
  return `| ${r.line} | ${r.confidence ?? '—'} | ${metrics} | ${where} | ${cov} |`;
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
  md.push('| Line | Conf | Metrics | Substantiating locations (games) | Currently in |');
  md.push('|---|---|---|---|---|');
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
md.push('## Needs review — weak evidence rejected as a default placement');
md.push('');
md.push('These lines have real encounter rows, but the total rarity-weighted evidence is below the trust gate (rare slots / 1–2 contexts). Their would-be tag and the rejected evidence are shown; each should get a curated knowledge entry or stay unplaced.');
const needsReview = records.filter((r) => r.recommended === 'needs-review');
if (needsReview.length) {
  md.push('');
  md.push('| Line | Would-be tag | Rejected evidence | Currently in |');
  md.push('|---|---|---|---|');
  for (const r of needsReview) {
    const ev = r.evidence
      ? r.evidence.locations.map((l) => `${l.location} (${l.region}, ${l.games.length}g${l.bestRarity != null && l.bestRarity < 10 ? `, ≤${l.bestRarity}%` : ''})`).join('; ')
      : '—';
    md.push(`| ${r.line} | ${r.scores[0]?.tag ?? '—'} | ${ev} | ${r.currentlyCovered.join(', ') || '**UNCOVERED**'} |`);
  }
} else {
  md.push('');
  md.push('_None._');
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
