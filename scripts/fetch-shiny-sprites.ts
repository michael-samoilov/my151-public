import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import { decode, encode, intact, maskDifference, samePixels, type Raster } from './png-rgba';
import powerupForms from '../src/league/data/powerupForms.json';
import sources from './data/shiny-sprite-sources.json';
import found from './data/shiny-sprite-placed.json';

const POKEAPI_COMMIT = 'https://raw.githubusercontent.com/PokeAPI/sprites/ba403973fdf9d0ac59175813861e6a1f8ed5020c/';
const POKEAPI = `${POKEAPI_COMMIT}sprites/pokemon`;
const BLACK_WHITE = `${POKEAPI}/versions/generation-v/black-white`;
const ARCHIVE = 'Generation_9_Pack_v3.3.8.rar:';
const PROTECTED = new Set(['77', '130', '147', '443', '612']);
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const UNREADABLE = /^https:\/\/sta\.sh\/|#frame=\d+$/;
const HELD = new Set(Object.keys(sources.held));
const SPRITE_FILE = /^\/sprites\/pokemon\/([^/?]+)\.png(?:\?|$)/;

const root = process.cwd();
const ours = (file: string) => join(root, 'public/sprites/pokemon', `${file}.png`);
const target = (file: string) => join(root, 'public/sprites/pokemon/shiny', `${file}.png`);
const OUTPUT = join(root, 'src/data/shinySprites.json');
const REENCODES = join(root, 'scripts/sprite-reencodes.json');
const cache = parseArgs({ options: { cache: { type: 'string' } } }).values.cache;

interface Source {
  normal: string;
  shiny: string;
  scale: number;
  offset: readonly number[];
  shinyOffset?: readonly number[];
  recolour?: boolean;
  unchecked?: string;
  sha256?: Digests;
}
interface Digests { normal: string; shiny: string; placed: string }
interface Unread { unread: string }
interface Catalogs { picker: Set<string>; slugs: Map<string, string>; league: Set<string> }
type Verdict =
  | { kind: 'pass'; shiny: Buffer }
  | { kind: 'outline'; mismatched: number | null }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'none' };
type Result = 'added' | 'replaced' | 'kept' | 'unchecked' | 'removed' | 'protected' | 'held' | 'none';

const placed = new Map<string, Source & { sha256: Digests }>(found.placed.map((entry) => [entry.file, entry]));
for (const url of found.placed.flatMap((entry) => [entry.normal, entry.shiny])) {
  if (url.startsWith('https://raw.githubusercontent.com/PokeAPI/') && !url.startsWith(POKEAPI_COMMIT)) throw new Error(`Read PokéAPI at ${POKEAPI_COMMIT}: ${url}`);
}

async function loadCatalogs(): Promise<Catalogs> {
  const load = async <T>(file: string) => (await runnerImport<T>(join(root, file), {
    configFile: false,
    root,
    logLevel: 'error',
    resolve: { alias: { '@': join(root, 'src') } },
  })).module;
  const picker = await load<{ allPickerMons(): readonly { sprite: string }[] }>('src/favorites/model/catalog.ts');
  const forms = await load<{ ALTERNATE_PICKER_FORMS: readonly { id: number; spritePath?: string }[] }>('src/favorites/model/alternateForms.ts');
  const league = await load<{ getAllPokemon(): { sprite: string }[] }>('src/league/data/catalog.ts');
  const spriteFiles = (mons: readonly { sprite: string }[]) => mons.flatMap((mon) => {
    const file = SPRITE_FILE.exec(mon.sprite)?.[1];
    return file ? [file] : [];
  });
  return {
    picker: new Set(spriteFiles(picker.allPickerMons())),
    slugs: new Map([
      ...forms.ALTERNATE_PICKER_FORMS.flatMap((form) => (form.spritePath ? [[String(form.id), form.spritePath] as const] : [])),
      ...Object.entries(sources.blackWhiteSlugs),
    ]),
    league: new Set([
      ...spriteFiles(league.getAllPokemon()),
      ...Object.values(powerupForms).flatMap((kinds) => [...kinds.mega, ...kinds.dynamax].map((form) => String(form.id))),
    ]),
  };
}

function sourcesFor(file: string, catalogs: Catalogs): Source[] {
  const at = (folder: string, name: string) => ({ normal: `${folder}/${name}.png`, shiny: `${folder}/shiny/${name}.png`, scale: 1, offset: [0, 0] });
  const slug = catalogs.slugs.get(file);
  return [
    ...(/^\d+$/.test(file) ? [at(POKEAPI, file)] : []),
    ...(slug ? [at(BLACK_WHITE, slug)] : []),
    ...(placed.has(file) ? [placed.get(file)!] : []),
  ];
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

async function load(ref: string, recorded?: string): Promise<Buffer | null | Unread> {
  const bytes = await download(ref);
  if (bytes instanceof Buffer && recorded && sha256(bytes) !== recorded) return { unread: `${ref} changed since its row was written` };
  return bytes;
}

async function download(ref: string): Promise<Buffer | null | Unread> {
  if (UNREADABLE.test(ref)) return { unread: 'its source is a Sta.sh page or a GIF frame' };
  if (ref.startsWith(ARCHIVE)) {
    const member = cache && join(cache, 'gen9pack/x', ref.slice(ARCHIVE.length));
    return member && existsSync(member) ? readFileSync(member) : { unread: `${ARCHIVE.slice(0, -1)} is not in the cache` };
  }
  const key = createHash('sha1').update(ref).digest('hex').slice(0, 20);
  const saved = cache && join(cache, 'cache', key);
  if (saved && existsSync(saved)) return readFileSync(saved);
  if (saved && existsSync(`${saved}.missing`)) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(ref, { headers: { 'User-Agent': 'curl/8.5.0' } });
      if (response.status === 404) {
        if (saved) writeFileSync(`${saved}.missing`, '404');
        return null;
      }
      if (!response.ok) throw new Error(`${response.status} ${ref}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Not a PNG file: ${ref}`);
      if (saved) writeFileSync(saved, bytes);
      return bytes;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

function place(art: Raster, { scale, offset: [dy, dx] }: Source, like: Raster): Raster {
  const { width, height } = like;
  if (scale === 1 && dy === 0 && dx === 0 && art.width === width && art.height === height) return art;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sy, sx] = [(y - dy) * scale, (x - dx) * scale];
      if (sy < 0 || sx < 0 || sy >= art.height || sx >= art.width) continue;
      const from = (sy * art.width + sx) * 4;
      if (art.data[from + 3] > 0) data.set(art.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function recolour(normal: Raster, shiny: Raster): Raster | null {
  const rgb = (data: Uint8Array, i: number) => (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
  const votes = new Map<number, Map<number, number>>();
  for (let i = 0; i < normal.data.length; i += 4) {
    if (normal.data[i + 3] === 0) continue;
    const colour = rgb(normal.data, i);
    const tally = votes.get(colour) ?? new Map<number, number>();
    votes.set(colour, tally);
    if (shiny.data[i + 3] === 0) continue;
    const vote = rgb(shiny.data, i);
    tally.set(vote, (tally.get(vote) ?? 0) + 1);
  }
  const map = new Map<number, number>();
  for (const [colour, tally] of votes) {
    const [best] = [...tally].sort(([a, m], [b, n]) => n - m || a - b);
    if (!best) return null;
    map.set(colour, best[0]);
  }
  const data = new Uint8Array(normal.data.length);
  for (let i = 0; i < data.length; i += 4) {
    if (normal.data[i + 3] === 0) continue;
    const to = map.get(rgb(normal.data, i))!;
    data.set([to >> 16, (to >> 8) & 0xff, to & 0xff, normal.data[i + 3]], i);
  }
  return { width: normal.width, height: normal.height, data };
}

async function judge(file: string, catalogs: Catalogs): Promise<Verdict> {
  const normal = decode(readFileSync(ours(file)));
  let mismatched: number | null | undefined;
  let unread: string | undefined;
  for (const source of sourcesFor(file, catalogs)) {
    if (source.unchecked) {
      unread ??= source.unchecked;
      continue;
    }
    const theirs = await load(source.normal, source.sha256?.normal);
    if (theirs && 'unread' in theirs) {
      unread ??= theirs.unread;
      continue;
    }
    if (!theirs || !samePixels(place(decode(theirs), source, normal), normal)) continue;
    const bytes = await load(source.shiny, source.sha256?.shiny);
    if (bytes && 'unread' in bytes) {
      unread ??= bytes.unread;
      continue;
    }
    if (!bytes) continue;
    const art = decode(bytes);
    const shiny = place(art, { ...source, offset: source.shinyOffset ?? source.offset }, normal);
    if (source.recolour) {
      const recoloured = recolour(normal, shiny);
      if (recoloured) return { kind: 'pass', shiny: encode(recoloured) };
    }
    const difference = maskDifference(shiny, normal);
    if (difference === 0) return { kind: 'pass', shiny: shiny === art && intact(bytes) ? bytes : encode(shiny) };
    mismatched ??= difference;
  }
  if (unread) return { kind: 'unavailable', reason: unread };
  return mismatched === undefined ? { kind: 'none' } : { kind: 'outline', mismatched };
}

const reencodes: Record<string, string> = JSON.parse(readFileSync(REENCODES, 'utf8'));
const verdicts = new Map<string, Verdict>();
const protectedMismatch = new Map<string, number | null>();
const unrecorded: string[] = [];

async function harvest(file: string, catalogs: Catalogs): Promise<Result> {
  if (!existsSync(ours(file))) return 'none';
  const shinyFile = target(file);
  const present = existsSync(shinyFile);
  if (HELD.has(file)) {
    delete reencodes[`/sprites/pokemon/shiny/${file}.png`];
    if (present) rmSync(shinyFile);
    return 'held';
  }
  if (PROTECTED.has(file)) {
    if (!present) return 'none';
    const difference = maskDifference(decode(readFileSync(shinyFile)), decode(readFileSync(ours(file))));
    if (difference !== 0) protectedMismatch.set(file, difference);
    return 'protected';
  }
  const verdict = await judge(file, catalogs);
  verdicts.set(file, verdict);
  if (verdict.kind === 'unavailable') {
    if (!present) return 'none';
    const recorded = placed.get(file)?.sha256.placed;
    if (recorded && sha256(readFileSync(shinyFile)) !== recorded) unrecorded.push(file);
    return 'unchecked';
  }
  if (verdict.kind === 'pass' && present && samePixels(decode(readFileSync(shinyFile)), decode(verdict.shiny))) return 'kept';
  delete reencodes[`/sprites/pokemon/shiny/${file}.png`];
  if (verdict.kind === 'pass') {
    writeFileSync(shinyFile, verdict.shiny);
    return present ? 'replaced' : 'added';
  }
  if (!present) return 'none';
  rmSync(shinyFile);
  return 'removed';
}

const byFile = (a: string, b: string) => {
  const [x, y] = [/^\d+$/.test(a), /^\d+$/.test(b)];
  return x && y ? Number(a) - Number(b) : x !== y ? (x ? -1 : 1) : a.localeCompare(b);
};

if (!existsSync(join(root, 'src/favorites/model/catalog.ts'))) throw new Error('Run this script from the repository root.');
if (cache) mkdirSync(join(cache, 'cache'), { recursive: true });
const catalogs = await loadCatalogs();
const files = [...new Set([...catalogs.picker, ...catalogs.league])].sort(byFile);
const results = new Map<string, Result>();
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < files.length) {
    const file = files[next++];
    results.set(file, await harvest(file, catalogs));
  }
}));

const shipped = files.filter((file) => ['added', 'replaced', 'kept', 'unchecked', 'protected'].includes(results.get(file)!));
writeFileSync(OUTPUT, `${JSON.stringify(shipped)}\n`);
writeFileSync(REENCODES, `${JSON.stringify(reencodes, null, 2)}\n`);
const count = (result: Result) => files.filter((file) => results.get(file) === result).length;
const pixels = (mismatched: number | null) => (mismatched === null ? 'another size' : `${mismatched} px`);
const outline = files.flatMap((file) => {
  const verdict = verdicts.get(file);
  return verdict?.kind === 'outline' ? [`${file} (${pixels(verdict.mismatched)})`] : [];
});
const unchecked = new Map<string, string[]>();
for (const file of files) {
  const verdict = verdicts.get(file);
  if (results.get(file) === 'unchecked' && verdict?.kind === 'unavailable') unchecked.set(verdict.reason, [...unchecked.get(verdict.reason) ?? [], file]);
}
const without = (set: Set<string>) => files.filter((file) => set.has(file) && !shipped.includes(file));
const leagueOnly = new Set([...catalogs.league].filter((file) => !catalogs.picker.has(file)));
console.log(`${shipped.length} of ${files.length} sprites have a shiny: ${count('added')} added, ${count('replaced')} replaced, ${count('kept')} kept, ${count('protected')} protected, ${count('held')} held, ${count('removed')} removed.`);
const held = files.filter((file) => results.get(file) === 'held');
console.log(`Held out of the app by scripts/data/shiny-sprite-sources.json (${held.length}): ${held.join(' ')}`);
console.log(`Rejected because the shiny's outline differs from our normal sprite (${outline.length}): ${outline.join(', ')}`);
for (const [reason, kept] of unchecked) console.log(`Kept unchecked because ${reason} (${kept.length}): ${kept.join(' ')}`);
if (unrecorded.length) console.log(`Kept unchecked, but the file's SHA-256 differs from its row in scripts/data/shiny-sprite-placed.json (${unrecorded.length}): ${unrecorded.join(' ')}`);
for (const [file, mismatched] of protectedMismatch) console.log(`Protected ${file} kept, but its outline differs from the normal sprite (${pixels(mismatched)}).`);
console.log(`Picker sprites without a shiny (${without(catalogs.picker).length}): ${without(catalogs.picker).join(' ')}`);
console.log(`League-only sprites without a shiny (${without(leagueOnly).length}): ${without(leagueOnly).join(' ')}`);
