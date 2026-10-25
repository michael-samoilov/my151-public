/**
 * Harvests the shiny sprites that the Favorite Pokémon Picker and the league
 * builder show when their Shiny switch is on, and writes the sorted ids that
 * have one to src/data/shinySprites.json.
 *
 * A source's shiny is taken only when it passes two checks against our normal
 * sprite:
 *
 * - Same art: the source's normal sprite shows the same pixels as ours.
 * - Same outline: the shiny's alpha mask equals our normal's, pixel for pixel.
 *   A shiny drawn from another design fails here even when the source's normal
 *   matches, as Terapagos Stellar (10277) did.
 *
 * The sources, tried in this order, all from PokéAPI at one pinned commit:
 *
 * 1. `sprites/pokemon/shiny/<id>.png`.
 * 2. For a picker form drawn from the Black and White folder (its
 *    `spritePath`, or a slug in `blackWhiteSlugs` in
 *    scripts/data/shiny-sprite-sources.json), that folder's shiny file.
 *
 * A run converges on the same files whatever an earlier run left: it writes a
 * missing or changed shiny, and deletes one that no longer passes along with
 * its scripts/sprite-reencodes.json entry. It never touches the shiny files
 * that were on production before the harvest (PROTECTED); it only reports one
 * whose outline differs. It prints the ids it rejected with their count of
 * mismatched pixels, and the ids with no shiny. After a run that adds files,
 * commit them and shrink them as the normal sprites were:
 * `python3 scripts/optimize-sprites.py HEAD public/sprites/pokemon/shiny`.
 *
 * `--cache <dir>` reads downloads from `<dir>/cache/<key>` and saves new ones
 * there, so a rerun needs no network. The key is the first 20 hex digits of
 * the URL's SHA-1.
 *
 * Usage: npx tsx scripts/fetch-shiny-sprites.ts [--cache <dir>]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import { decode, maskDifference, samePixels } from './png-rgba';
import powerupForms from '../src/league/data/powerupForms.json';
import sources from './data/shiny-sprite-sources.json';

const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/ba403973fdf9d0ac59175813861e6a1f8ed5020c/sprites/pokemon';
const BLACK_WHITE = `${POKEAPI}/versions/generation-v/black-white`;
const PROTECTED = new Set([77, 130, 147, 443, 612]);
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const SPRITE_ID = /^\/sprites\/pokemon\/(\d+)\.png(?:\?|$)/;

const root = process.cwd();
const ours = (id: number) => join(root, 'public/sprites/pokemon', `${id}.png`);
const target = (id: number) => join(root, 'public/sprites/pokemon/shiny', `${id}.png`);
const OUTPUT = join(root, 'src/data/shinySprites.json');
const REENCODES = join(root, 'scripts/sprite-reencodes.json');
const cache = parseArgs({ options: { cache: { type: 'string' } } }).values.cache;

interface Source { normal: string; shiny: string }
interface Catalogs { picker: Set<number>; slugs: Map<number, string>; league: Set<number> }
type Verdict = { kind: 'pass'; shiny: Buffer } | { kind: 'outline'; mismatched: number | null } | { kind: 'none' };
type Result = 'added' | 'replaced' | 'kept' | 'removed' | 'protected' | 'none';

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
  const spriteIds = (mons: readonly { sprite: string }[]) => mons.flatMap((mon) => {
    const id = SPRITE_ID.exec(mon.sprite)?.[1];
    return id ? [Number(id)] : [];
  });
  return {
    picker: new Set(spriteIds(picker.allPickerMons())),
    slugs: new Map([
      ...forms.ALTERNATE_PICKER_FORMS.flatMap((form) => (form.spritePath ? [[form.id, form.spritePath] as const] : [])),
      ...Object.entries(sources.blackWhiteSlugs).map(([id, slug]) => [Number(id), slug] as const),
    ]),
    league: new Set([
      ...spriteIds(league.getAllPokemon()),
      ...Object.values(powerupForms).flatMap((kinds) => [...kinds.mega, ...kinds.dynamax].map((form) => form.id)),
    ]),
  };
}

function sourcesFor(id: number, catalogs: Catalogs): Source[] {
  const list = [{ normal: `${POKEAPI}/${id}.png`, shiny: `${POKEAPI}/shiny/${id}.png` }];
  const slug = catalogs.slugs.get(id);
  if (slug) list.push({ normal: `${BLACK_WHITE}/${slug}.png`, shiny: `${BLACK_WHITE}/shiny/${slug}.png` });
  return list;
}

async function download(url: string): Promise<Buffer | null> {
  const key = createHash('sha1').update(url).digest('hex').slice(0, 20);
  const saved = cache && join(cache, 'cache', key);
  if (saved && existsSync(saved)) return readFileSync(saved);
  if (saved && existsSync(`${saved}.missing`)) return null;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'curl/8.5.0' } });
      if (response.status === 404) {
        if (saved) writeFileSync(`${saved}.missing`, '404');
        return null;
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Not a PNG file: ${url}`);
      if (saved) writeFileSync(saved, bytes);
      return bytes;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function judge(id: number, catalogs: Catalogs): Promise<Verdict> {
  const normal = decode(readFileSync(ours(id)));
  let mismatched: number | null | undefined;
  for (const source of sourcesFor(id, catalogs)) {
    const theirs = await download(source.normal);
    if (!theirs || !samePixels(decode(theirs), normal)) continue;
    const shiny = await download(source.shiny);
    if (!shiny) continue;
    const difference = maskDifference(decode(shiny), normal);
    if (difference === 0) return { kind: 'pass', shiny };
    mismatched ??= difference;
  }
  return mismatched === undefined ? { kind: 'none' } : { kind: 'outline', mismatched };
}

const reencodes: Record<string, string> = JSON.parse(readFileSync(REENCODES, 'utf8'));
const verdicts = new Map<number, Verdict>();
const protectedMismatch = new Map<number, number | null>();

async function harvest(id: number, catalogs: Catalogs): Promise<Result> {
  if (!existsSync(ours(id))) return 'none';
  const file = target(id);
  const present = existsSync(file);
  if (PROTECTED.has(id)) {
    if (!present) return 'none';
    const difference = maskDifference(decode(readFileSync(file)), decode(readFileSync(ours(id))));
    if (difference !== 0) protectedMismatch.set(id, difference);
    return 'protected';
  }
  const verdict = await judge(id, catalogs);
  verdicts.set(id, verdict);
  if (verdict.kind === 'pass' && present && samePixels(decode(readFileSync(file)), decode(verdict.shiny))) return 'kept';
  delete reencodes[`/sprites/pokemon/shiny/${id}.png`];
  if (verdict.kind === 'pass') {
    writeFileSync(file, verdict.shiny);
    return present ? 'replaced' : 'added';
  }
  if (!present) return 'none';
  rmSync(file);
  return 'removed';
}

if (!existsSync(join(root, 'src/favorites/model/catalog.ts'))) throw new Error('Run this script from the repository root.');
if (cache) mkdirSync(join(cache, 'cache'), { recursive: true });
const catalogs = await loadCatalogs();
const ids = [...new Set([...catalogs.picker, ...catalogs.league])].sort((a, b) => a - b);
const results = new Map<number, Result>();
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < ids.length) {
    const id = ids[next++];
    results.set(id, await harvest(id, catalogs));
  }
}));

const shipped = ids.filter((id) => ['added', 'replaced', 'kept', 'protected'].includes(results.get(id)!));
writeFileSync(OUTPUT, `${JSON.stringify(shipped)}\n`);
writeFileSync(REENCODES, `${JSON.stringify(reencodes, null, 2)}\n`);
const count = (result: Result) => ids.filter((id) => results.get(id) === result).length;
const pixels = (mismatched: number | null) => (mismatched === null ? 'another size' : `${mismatched} px`);
const outline = ids.flatMap((id) => {
  const verdict = verdicts.get(id);
  return verdict?.kind === 'outline' ? [`${id} (${pixels(verdict.mismatched)})`] : [];
});
const without = (set: Set<number>) => ids.filter((id) => set.has(id) && !shipped.includes(id));
const leagueOnly = new Set([...catalogs.league].filter((id) => !catalogs.picker.has(id)));
console.log(`${shipped.length} of ${ids.length} sprites have a shiny: ${count('added')} added, ${count('replaced')} replaced, ${count('kept')} kept, ${count('protected')} protected, ${count('removed')} removed.`);
console.log(`Rejected because the shiny's outline differs from our normal sprite (${outline.length}): ${outline.join(', ')}`);
for (const [id, mismatched] of protectedMismatch) console.log(`Protected ${id} kept, but its outline differs from the normal sprite (${pixels(mismatched)}).`);
console.log(`Picker ids without a shiny (${without(catalogs.picker).length}): ${without(catalogs.picker).join(' ')}`);
console.log(`League-only ids without a shiny (${without(leagueOnly).length}): ${without(leagueOnly).join(' ')}`);
