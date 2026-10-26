/**
 * Writes src/data/bundleCredits.json: for each sprite bundle in the
 * Acknowledgements panel, the app's fan-made sprite files credited through
 * it, and its artists ranked by those files.
 *
 * Every shown fan-made file counts under exactly one entry:
 *
 * - a direct upload counts under its artist's own entry;
 * - any other file counts under the bundle whose records credit its artist
 *   (`via` in src/data/spriteAttribution.json): the Smogon Sprite Project for
 *   its four sheets, PokéAPI for its own credits, or the Generation 9
 *   Resource Pack for its sheet;
 * - a fan-made file with no attribution row counts under PokéAPI when it came
 *   from PokéAPI's files, and otherwise must be in GAME_FREAK.
 *
 * Game Freak's own sprites and my151's own drawing count nowhere. An artist
 * counts a file only when docs/credits/sprite-evidence.json confirms it;
 * every other file counts under its entry as "artist not confirmed". The
 * panel never says which files my151 changed (`changedBy`).
 *
 * `pokeapi` counts the files PokéAPI delivers, from
 * docs/credits/pokeapi-delivery.json (scripts/credits/pokeapi-delivery.py):
 * Game Freak's sprites, the Smogon Sprite Project's, and PokéAPI's own.
 *
 * Usage: npx tsx scripts/credits/bundle-credits.ts [--check]
 * --check writes nothing. It fails when the partition has a gap or an
 * overlap, or when the JSON file is out of date.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface LedgerRow {
  file: string;
  sha256: string;
  evidenceType: string;
  verdict: string;
  sources: { url?: string }[];
}
interface AttributionRow {
  via: string;
  artists: string[];
  changedBy?: string;
}
interface DeliveryRow {
  sha256: string;
  /** The PokéAPI commit and file with the same pixels, or null. */
  pokeapi: string | null;
}
interface ArtistTerms {
  urls: string[];
  linkStatus: string;
}

export interface BundleEntry {
  sprites: number;
  unconfirmed: number;
  /** [artist, files], most files first, ties by name. */
  artists: [string, number][];
}
/** The shown files that PokéAPI delivers. */
export interface PokeApiDelivery {
  /** Game Freak's sprites. */
  official: number;
  /** Files credited through the Smogon Sprite Project. */
  smogon: number;
  /** Files credited through PokéAPI itself. */
  own: number;
}
export interface BundleCredits {
  note: string;
  entries: Record<string, BundleEntry>;
  pokeapi: PokeApiDelivery;
  /** Each listed artist's profile, only where it is proven to be theirs. */
  links: Record<string, string>;
}

const root = process.cwd();
const OUT = 'src/data/bundleCredits.json';
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(root, file), 'utf8')) as T;

const ENTRY_BY_VIA: Record<string, string> = {
  'smogon-gen6': 'smogon-sprite-project',
  'smogon-gen7': 'smogon-sprite-project',
  'smogon-gen8': 'smogon-sprite-project',
  'smogon-gen9': 'smogon-sprite-project',
  pokeapi: 'pokeapi-sprites',
  'gen9-resource-pack': 'gen9-resource-pack',
};
const OWN_UPLOAD = 'own upload';
const OUR_OWN = 'my151';
/**
 * Fan-made by the ledger, but Game Freak's battle-animation frames: the
 * sprite lab's credit sheet measured both (Michael, 2026-10-12: the
 * Overdrive forms get no separate credit).
 */
const GAME_FREAK: Record<string, string> = {
  '11107': "Black Kyurem Overdrive: Game Freak's frame 0 of PokéAPI's 10022.gif, cropped",
  '11108': "White Kyurem Overdrive: Game Freak's frames 0, 76 and 120 of PokéAPI's 10023.gif",
};

const ledger = read<LedgerRow[]>('docs/credits/sprite-evidence.json');
const attribution = read<{ sprites: Record<string, AttributionRow> }>('src/data/spriteAttribution.json').sprites;
const terms = read<{ artists: Record<string, ArtistTerms> }>('src/data/creditTerms.json').artists;
const DELIVERY = 'docs/credits/pokeapi-delivery.json';
const delivery = read<{ files: Record<string, DeliveryRow> }>(DELIVERY).files;

/** A ledger file's key in src/data/spriteAttribution.json: `650`, or `shiny/650` for its shiny. */
const fileId = (file: string) => file.replace(/^public\/sprites\/pokemon\/|\.png$/g, '');
const fromPokeApi = (row: LedgerRow) => row.sources.some((s) => s.url?.startsWith('https://github.com/PokeAPI/sprites/'));

/** The entry each shown fan-made file counts under; Game Freak's and my151's files are absent. */
const entryOf = new Map<string, string>();
const problems: string[] = [];
for (const row of ledger) {
  const id = fileId(row.file);
  const credit = attribution[id];
  if (row.evidenceType === 'official-game-freak' || GAME_FREAK[id] || credit?.via === OUR_OWN) continue;
  const entry = credit
    ? credit.via === OWN_UPLOAD ? credit.artists.map((name) => `artist:${name}`).join('+') : ENTRY_BY_VIA[credit.via]
    : fromPokeApi(row) ? 'pokeapi-sprites' : undefined;
  if (!entry || entry.includes('+')) {
    problems.push(`${row.file}: counts under no single entry (via ${credit?.via ?? 'none'}).`);
    continue;
  }
  if (entryOf.has(id)) problems.push(`${row.file}: has two ledger rows.`);
  entryOf.set(id, entry);
}

const entries: Record<string, BundleEntry> = {};
const byArtist = new Map<string, Map<string, number>>();
for (const row of ledger) {
  const id = fileId(row.file);
  const entry = entryOf.get(id);
  if (!entry) continue;
  const tally = (entries[entry] ??= { sprites: 0, unconfirmed: 0, artists: [] });
  tally.sprites += 1;
  if (row.verdict !== 'confirmed') {
    tally.unconfirmed += 1;
    continue;
  }
  const counts = byArtist.get(entry) ?? new Map<string, number>();
  byArtist.set(entry, counts);
  for (const name of attribution[id].artists) counts.set(name, (counts.get(name) ?? 0) + 1);
}
for (const [entry, counts] of byArtist) {
  entries[entry].artists = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }));
}

const listed = new Set(Object.values(entries).flatMap((entry) => entry.artists.map(([name]) => name)));
const links = Object.fromEntries([...listed].sort().flatMap((name) => {
  const artist = terms[name];
  const url = artist?.linkStatus === 'proven' ? artist.urls.find((u) => !u.includes('smogon.com/forums/members/')) : undefined;
  return url ? [[name, url]] : [];
}));

const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));

// PokéAPI's deliveries. A file that my151 changed is not PokéAPI's file. Any
// other file that these counts can include needs a current delivery row.
const pokeapi: PokeApiDelivery = { official: 0, smogon: 0, own: 0 };
const DELIVERY_COUNT: Record<string, keyof PokeApiDelivery> = { 'smogon-sprite-project': 'smogon', 'pokeapi-sprites': 'own' };
for (const row of ledger) {
  const id = fileId(row.file);
  const count = row.evidenceType === 'official-game-freak' || GAME_FREAK[id] ? 'official' : DELIVERY_COUNT[entryOf.get(id) ?? ''];
  if (!count || attribution[id]?.changedBy === OUR_OWN) continue;
  const delivered = delivery[row.file];
  if (delivered?.sha256 !== row.sha256) {
    problems.push(`${row.file}: ${DELIVERY} has no current row. Run python3 scripts/credits/pokeapi-delivery.py (see its header).`);
    continue;
  }
  // The four Overdrive stills are frames of PokéAPI's animated GIFs: their
  // ledger rows and GAME_FREAK say so.
  if (delivered.pokeapi || (count === 'official' && (fromPokeApi(row) || GAME_FREAK[id]))) pokeapi[count] += 1;
}

const credits: BundleCredits = {
  note: 'Generated by scripts/credits/bundle-credits.ts from docs/credits/sprite-evidence.json, src/data/spriteAttribution.json and docs/credits/pokeapi-delivery.json. Do not edit.',
  entries: sorted,
  pokeapi,
  links,
};

// The partition: every fan-made file under one entry, and the totals add up.
const fanFiles = ledger.filter((row) => {
  const id = fileId(row.file);
  return row.evidenceType !== 'official-game-freak' && !GAME_FREAK[id] && attribution[id]?.via !== OUR_OWN;
});
const counted = Object.values(entries).reduce((sum, entry) => sum + entry.sprites, 0);
if (counted !== fanFiles.length) problems.push(`The entries count ${counted} files, but ${fanFiles.length} shown files are fan-made.`);
const gaps = fanFiles.filter((row) => !entryOf.has(fileId(row.file)));
for (const row of gaps) problems.push(`${row.file}: fan-made, but counts under no entry.`);

const total = ledger.length;
const gameFreak = ledger.filter((row) => row.evidenceType === 'official-game-freak' || GAME_FREAK[fileId(row.file)]).length;
const ours = ledger.filter((row) => attribution[fileId(row.file)]?.via === OUR_OWN).length;
console.log(`bundle-credits: ${total} shown files = ${gameFreak} Game Freak + ${ours} my151 + ${fanFiles.length} fan-made`);
console.log('entry'.padEnd(28), 'files'.padStart(6), 'confirmed'.padStart(10), 'not conf.'.padStart(10), 'artists'.padStart(8), 'linked'.padStart(7));
for (const [entry, tally] of Object.entries(sorted)) {
  const linked = tally.artists.filter(([name]) => links[name]).length;
  console.log(entry.padEnd(28), String(tally.sprites).padStart(6), String(tally.sprites - tally.unconfirmed).padStart(10), String(tally.unconfirmed).padStart(10), String(tally.artists.length).padStart(8), String(linked).padStart(7));
}
const overlaps = counted - (fanFiles.length - gaps.length);
if (overlaps) problems.push(`${overlaps} file(s) count under more than one entry.`);
console.log('total'.padEnd(28), String(counted).padStart(6), `gaps ${gaps.length}, overlaps ${overlaps}, problems ${problems.length}`);
console.log(`PokéAPI delivers ${pokeapi.official} Game Freak + ${pokeapi.smogon} Smogon Sprite Project + ${pokeapi.own} PokéAPI-credited files`);

const json = `${JSON.stringify(credits, null, 1)}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(path.join(root, OUT), 'utf8');
  } catch {
    // Reported below.
  }
  if (current !== json) problems.push(`${OUT} is out of date. Run npx tsx scripts/credits/bundle-credits.ts.`);
} else if (!problems.length) {
  writeFileSync(path.join(root, OUT), json);
}
if (problems.length) {
  console.error(`bundle-credits: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
