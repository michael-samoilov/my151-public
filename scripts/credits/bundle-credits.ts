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
  pokeapi: string | null;
}
interface ArtistTerms {
  urls: string[];
  linkStatus: string;
}

export interface BundleEntry {
  sprites: number;
  unconfirmed: number;
  artists: [artist: string, files: number][];
}
export interface PokeApiDelivery {
  official: number;
  smogon: number;
  own: number;
}
export interface BundleCredits {
  note: string;
  entries: Record<string, BundleEntry>;
  pokeapi: PokeApiDelivery;
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
const GAME_FREAK_ANIMATION_FRAMES: Record<string, string> = {
  '11107': "Black Kyurem Overdrive: Game Freak's frame 0 of PokéAPI's 10022.gif, cropped",
  '11108': "White Kyurem Overdrive: Game Freak's frames 0, 76 and 120 of PokéAPI's 10023.gif",
};

const ledger = read<LedgerRow[]>('docs/credits/sprite-evidence.json');
const attribution = read<{ sprites: Record<string, AttributionRow> }>('src/data/spriteAttribution.json').sprites;
const terms = read<{ artists: Record<string, ArtistTerms> }>('src/data/creditTerms.json').artists;
const DELIVERY = 'docs/credits/pokeapi-delivery.json';
const delivery = read<{ files: Record<string, DeliveryRow> }>(DELIVERY).files;

const fileId = (file: string) => file.replace(/^public\/sprites\/pokemon\/|\.png$/g, '');
const fromPokeApi = (row: LedgerRow) => row.sources.some((s) => s.url?.startsWith('https://github.com/PokeAPI/sprites/'));

const SHINY = 'shiny/';
const problems: string[] = [];
const covered = new Set<string>();
for (const row of ledger) {
  const id = fileId(row.file);
  if (!id.startsWith(SHINY)) continue;
  const credit = attribution[id];
  if (!credit) {
    covered.add(id);
    continue;
  }
  const normal = attribution[id.slice(SHINY.length)]?.artists ?? [];
  if (row.verdict !== 'confirmed' || credit.artists.every((name) => normal.includes(name))) {
    problems.push(`${row.file}: names no confirmed artist beyond its normal sprite's, whose credit covers it. Remove its row from src/data/spriteAttribution.json.`);
  }
}
const panelFiles = ledger.filter((row) => !covered.has(fileId(row.file)));

const entryOf = new Map<string, string>();
for (const row of panelFiles) {
  const id = fileId(row.file);
  const credit = attribution[id];
  if (row.evidenceType === 'official-game-freak' || GAME_FREAK_ANIMATION_FRAMES[id] || credit?.via === OUR_OWN) continue;
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
for (const row of panelFiles) {
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

const pokeapi: PokeApiDelivery = { official: 0, smogon: 0, own: 0 };
const DELIVERY_COUNT: Record<string, keyof PokeApiDelivery> = { 'smogon-sprite-project': 'smogon', 'pokeapi-sprites': 'own' };
for (const row of panelFiles) {
  const id = fileId(row.file);
  const count = row.evidenceType === 'official-game-freak' || GAME_FREAK_ANIMATION_FRAMES[id] ? 'official' : DELIVERY_COUNT[entryOf.get(id) ?? ''];
  if (!count || attribution[id]?.changedBy === OUR_OWN) continue;
  const delivered = delivery[row.file];
  if (delivered?.sha256 !== row.sha256) {
    problems.push(`${row.file}: ${DELIVERY} has no current row. Run python3 scripts/credits/pokeapi-delivery.py (see its header).`);
    continue;
  }
  if (delivered.pokeapi || (count === 'official' && (fromPokeApi(row) || GAME_FREAK_ANIMATION_FRAMES[id]))) pokeapi[count] += 1;
}

const credits: BundleCredits = {
  note: 'Generated by scripts/credits/bundle-credits.ts from docs/credits/sprite-evidence.json, src/data/spriteAttribution.json and docs/credits/pokeapi-delivery.json. Do not edit.',
  entries: sorted,
  pokeapi,
  links,
};

const fanFiles = panelFiles.filter((row) => {
  const id = fileId(row.file);
  return row.evidenceType !== 'official-game-freak' && !GAME_FREAK_ANIMATION_FRAMES[id] && attribution[id]?.via !== OUR_OWN;
});
const counted = Object.values(entries).reduce((sum, entry) => sum + entry.sprites, 0);
if (counted !== fanFiles.length) problems.push(`The entries count ${counted} files, but ${fanFiles.length} shown files are fan-made.`);
const gaps = fanFiles.filter((row) => !entryOf.has(fileId(row.file)));
for (const row of gaps) problems.push(`${row.file}: fan-made, but counts under no entry.`);

const gameFreak = panelFiles.filter((row) => row.evidenceType === 'official-game-freak' || GAME_FREAK_ANIMATION_FRAMES[fileId(row.file)]).length;
const ours = panelFiles.filter((row) => attribution[fileId(row.file)]?.via === OUR_OWN).length;
console.log(`bundle-credits: ${ledger.length} shown files = ${covered.size} shinies their normal sprite covers + ${gameFreak} Game Freak + ${ours} my151 + ${fanFiles.length} fan-made`);
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
  } catch {}
  if (current !== json) problems.push(`${OUT} is out of date. Run npx tsx scripts/credits/bundle-credits.ts.`);
} else if (!problems.length) {
  writeFileSync(path.join(root, OUT), json);
}
if (problems.length) {
  console.error(`bundle-credits: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
