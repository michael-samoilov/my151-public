/**
 * Harvests the shiny sprites that the Favorite Pokémon Picker and the league
 * builder show when their Shiny switch is on, and writes the sorted ids that
 * have one to src/data/shinySprites.json.
 *
 * A shiny file is taken only when its source's normal sprite decodes to the
 * same RGBA as ours, so the shiny shows the same art in other colors. The
 * sources, tried in this order:
 *
 * 1. PokéAPI `sprites/pokemon/shiny/<id>.png`.
 * 2. The same file for an id that scripts/data/shiny-sprite-sources.json lists
 *    under `reviewed.main`: its normal differs by a few pixels, and a person
 *    checked that the art is the same.
 * 3. For a picker form drawn from the Black and White folder (its
 *    `spritePath`, or a slug in `blackWhiteSlugs`), that folder's shiny file at
 *    the commit the normal came from. `reviewed.blackWhite` lists the ids
 *    accepted by eye.
 *
 * Sources 2 and 3 apply only to ids the picker shows. Ids that only the league
 * shows need the exact pixel match.
 *
 * It never rewrites a file under public/sprites/pokemon/shiny, so it is safe to
 * rerun. It prints the ids that got no shiny. After a run that adds files,
 * commit them and shrink them as the normal sprites were:
 * `python3 scripts/optimize-sprites.py HEAD public/sprites/pokemon/shiny`.
 *
 * Usage: npx tsx scripts/fetch-shiny-sprites.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runnerImport } from 'vite';
import { decode } from './png-rgba';
import powerupForms from '../src/league/data/powerupForms.json';
import sources from './data/shiny-sprite-sources.json';

const MAIN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const BLACK_WHITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/ba403973fdf9d0ac59175813861e6a1f8ed5020c/sprites/pokemon/versions/generation-v/black-white';
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const SPRITE_ID = /^\/sprites\/pokemon\/(\d+)\.png(?:\?|$)/;

const root = process.cwd();
const ours = (id: number) => join(root, 'public/sprites/pokemon', `${id}.png`);
const target = (id: number) => join(root, 'public/sprites/pokemon/shiny', `${id}.png`);
const OUTPUT = join(root, 'src/data/shinySprites.json');

interface Source { normal: string; shiny: string; reviewed: boolean }
interface Catalogs { picker: Set<number>; slugs: Map<number, string>; league: Set<number> }

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
  const picker = catalogs.picker.has(id);
  const list = [{ normal: `${MAIN}/${id}.png`, shiny: `${MAIN}/shiny/${id}.png`, reviewed: picker && sources.reviewed.main.includes(id) }];
  const slug = picker ? catalogs.slugs.get(id) : undefined;
  if (slug) {
    list.push({ normal: `${BLACK_WHITE}/${slug}.png`, shiny: `${BLACK_WHITE}/shiny/${slug}.png`, reviewed: sources.reviewed.blackWhite.includes(id) });
  }
  return list;
}

async function download(url: string): Promise<Buffer | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Not a PNG file: ${url}`);
      return bytes;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

function samePixels(a: Buffer, b: Buffer): boolean {
  const [x, y] = [decode(a), decode(b)];
  return x.width === y.width && x.height === y.height && Buffer.from(x.data).equals(Buffer.from(y.data));
}

async function harvest(id: number, catalogs: Catalogs): Promise<'added' | 'kept' | null> {
  if (!existsSync(ours(id))) return null;
  const normal = readFileSync(ours(id));
  for (const source of sourcesFor(id, catalogs)) {
    if (!source.reviewed) {
      const theirs = await download(source.normal);
      if (!theirs || !samePixels(theirs, normal)) continue;
    }
    if (existsSync(target(id))) return 'kept';
    const shiny = await download(source.shiny);
    if (!shiny) continue;
    await writeFile(target(id), shiny, { flag: 'wx' });
    return 'added';
  }
  return null;
}

if (!existsSync(join(root, 'src/favorites/model/catalog.ts'))) throw new Error('Run this script from the repository root.');
const catalogs = await loadCatalogs();
const ids = [...new Set([...catalogs.picker, ...catalogs.league])].sort((a, b) => a - b);
const results = new Map<number, Awaited<ReturnType<typeof harvest>>>();
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < ids.length) {
    const id = ids[next++];
    results.set(id, await harvest(id, catalogs));
  }
}));

const shiny = ids.filter((id) => results.get(id));
writeFileSync(OUTPUT, `${JSON.stringify(shiny)}\n`);
const count = (outcome: 'added' | 'kept') => ids.filter((id) => results.get(id) === outcome).length;
const unpaired = (set: Set<number>) => ids.filter((id) => set.has(id) && !results.get(id));
console.log(`${shiny.length} of ${ids.length} ids have a shiny: ${count('added')} added, ${count('kept')} kept.`);
console.log(`Picker ids without a shiny (${unpaired(catalogs.picker).length}): ${unpaired(catalogs.picker).join(' ')}`);
const leagueOnly = new Set([...catalogs.league].filter((id) => !catalogs.picker.has(id)));
console.log(`League-only ids without a shiny (${unpaired(leagueOnly).length}): ${unpaired(leagueOnly).join(' ')}`);
