

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runnerImport } from 'vite';

interface CatalogMon { id: number; name: string; sprite: string }
interface Archetype {
  id: string;
  shinyIds?: number[];
  subgroups?: { shinyIds?: number[] }[];
  spriteOverrides?: Record<number, string>;
}
interface Catalogs {
  dexPokemon(): CatalogMon[];
  leaguePokemon(): CatalogMon[];
  archetypes: Archetype[];
  formsFor(pokemonId: number, kind: 'mega' | 'dynamax'): { id: number; label: string }[];
  allPickerMons(): readonly (CatalogMon & { source: string })[];
  shinySpriteUrl(sprite: string): string | null;
}

async function loadCatalogs(root: string): Promise<Catalogs> {
  const load = async <T>(file: string) => (await runnerImport<T>(join(root, file), {
    configFile: false,
    root,
    logLevel: 'error',
    resolve: { alias: { '@': join(root, 'src') } },
  })).module;
  const dex = await load<{ getAllPokemon(): CatalogMon[] }>('src/hooks/usePokemonData.ts');
  const archetypes = await load<{ ARCHETYPES: Archetype[] }>('src/data/archetypes.ts');
  const league = await load<{ getAllPokemon(): CatalogMon[] }>('src/league/data/catalog.ts');
  const powerups = await load<Pick<Catalogs, 'formsFor'>>('src/league/model/powerups.ts');
  const picker = await load<Pick<Catalogs, 'allPickerMons'>>('src/favorites/model/catalog.ts');
  const sprites = await load<Pick<Catalogs, 'shinySpriteUrl'>>('src/lib/spriteUrl.ts');
  return {
    dexPokemon: dex.getAllPokemon,
    leaguePokemon: league.getAllPokemon,
    archetypes: archetypes.ARCHETYPES,
    formsFor: powerups.formsFor,
    allPickerMons: picker.allPickerMons,
    shinySpriteUrl: sprites.shinySpriteUrl,
  };
}

export type Tool = 'Pokédex builder' | 'League builder' | 'Favorite picker';

export interface SpriteUse {
  tool: Tool;
  as: string;
  via: string;
}

const file = (url: string): string => {
  const path = url.split('?')[0];
  if (!path.startsWith('/sprites/pokemon/')) throw new Error(`Not a Pokémon sprite URL: ${url}`);
  return path.slice('/sprites/'.length);
};

const SHIPPED_ENTRIES = ['src'];
const IMPORTED = new Set(['src/favorites/model/catalog.ts', 'src/data/archetypes.ts', 'src/lib/spriteUrl.ts']);
const SKIPPED = /\.test\.tsx?$|\/(levels|slotlab|foil-workshop|components\/admin)\//;

function shippedSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !SKIPPED.test(full)) out.push(full);
    }
  };
  for (const entry of SHIPPED_ENTRIES) walk(join(root, entry));
  return out;
}

function literalUses(root: string): Array<{ file: string; source: string }> {
  const found: Array<{ file: string; source: string }> = [];
  for (const path of shippedSourceFiles(root)) {
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(/pokemonSpriteUrl\((\d+)\)/g)) {
      found.push({ file: `pokemon/${m[1]}.png`, source: relative(root, path) });
    }
    for (const m of text.matchAll(/\/sprites\/(pokemon\/[a-z0-9/-]+\.png)/g)) {
      found.push({ file: m[1], source: relative(root, path) });
    }
  }
  return found;
}

export async function shownSprites(root = process.cwd()): Promise<Map<string, SpriteUse[]>> {
  const { dexPokemon, leaguePokemon, archetypes, formsFor, allPickerMons, shinySpriteUrl } = await loadCatalogs(root);
  const uses = new Map<string, SpriteUse[]>();
  const add = (url: string, use: SpriteUse) => {
    const key = file(url);
    const list = uses.get(key) ?? [];
    if (!list.some((u) => u.tool === use.tool && u.as === use.as)) list.push(use);
    uses.set(key, list);
  };
  const addWithShiny = (url: string, use: SpriteUse) => {
    add(url, use);
    const shiny = shinySpriteUrl(url);
    if (shiny) add(shiny, { tool: use.tool, as: `${use.as} (shiny)`, via: `${use.via}, Shiny switch` });
  };

  const dex = dexPokemon();
  const dexById = new Map(dex.map((p) => [p.id, p]));
  for (const p of dex) add(p.sprite, { tool: 'Pokédex builder', as: p.name, via: 'src/data/pokemon.json sprite' });

  const league = leaguePokemon();
  const leagueById = new Map(league.map((p) => [p.id, p]));
  for (const archetype of archetypes) {
    const shiny = new Set([...(archetype.shinyIds ?? []), ...(archetype.subgroups ?? []).flatMap((s) => s.shinyIds ?? [])]);
    for (const id of shiny) {
      for (const [tool, byId] of [['Pokédex builder', dexById], ['League builder', leagueById]] as const) {
        const mon = byId.get(id);
        if (!mon) continue;
        add(mon.sprite.replace('/pokemon/', '/pokemon/shiny/'), { tool, as: `${mon.name} (shiny)`, via: `archetype '${archetype.id}' shinyIds` });
      }
    }
    for (const [id, url] of Object.entries(archetype.spriteOverrides ?? {})) {
      for (const [tool, byId] of [['Pokédex builder', dexById], ['League builder', leagueById]] as const) {
        const mon = byId.get(Number(id));
        if (!mon) continue;
        add(url, { tool, as: `${mon.name} (archetype '${archetype.id}' art)`, via: `archetype '${archetype.id}' spriteOverrides` });
      }
    }
  }

  for (const p of league) addWithShiny(p.sprite, { tool: 'League builder', as: p.name, via: 'league catalog sprite' });
  for (const p of league) {
    for (const kind of ['mega', 'dynamax'] as const) {
      for (const form of formsFor(p.id, kind)) {
        addWithShiny(`/sprites/pokemon/${form.id}.png`, { tool: 'League builder', as: form.label, via: `powerup ${kind} of ${p.name}` });
      }
    }
  }

  for (const mon of allPickerMons()) addWithShiny(mon.sprite, { tool: 'Favorite picker', as: mon.name, via: `picker catalog (${mon.source})` });

  for (const literal of literalUses(root)) {
    if (IMPORTED.has(literal.source)) continue;
    const id = Number(/(\d+)\.png$/.exec(literal.file)?.[1]);
    const mon = dexById.get(id) ?? leagueById.get(id);
    add(`/sprites/${literal.file}`, {
      tool: literal.source.includes('/league/') ? 'League builder' : literal.source.includes('/favorites/') ? 'Favorite picker' : 'Pokédex builder',
      as: mon?.name ?? `id ${id}`,
      via: `literal in ${literal.source}`,
    });
  }
  return uses;
}
