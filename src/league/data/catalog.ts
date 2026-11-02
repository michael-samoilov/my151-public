import { getAllPokemon as getDexPokemon, type PokemonDataSource } from '@/hooks/usePokemonData';
import { pokemonSpriteUrl } from '@/lib/spriteUrl';
import type { Pokemon } from '@/types/pokemon';
import league from '@/data/generated/league.json';
import favoriteBrowserIds from '@/components/browser/favoriteBrowserIds.json';
import { STANDALONE_FORM_IDS } from './formPolicy';

type LeagueFields = Partial<Omit<Pokemon, 'id' | 'name' | 'sprite' | 'archetypes'>>;
type LeagueForm = LeagueFields & { id: number; owner: number; name: string; sprite?: string };
const generated = league as unknown as {
  dex: Record<string, LeagueFields>;
  forms: LeagueForm[];
  extraEvolutions: [number, number][];
};

/** The forms the League adds to the Dex rows. `npm run ontology:build` writes them from data/ontology/. */
export const LEAGUE_ALTERNATE_FORMS: readonly LeagueForm[] = generated.forms;
const pokemon: Pokemon[] = getDexPokemon().map(mon => ({ ...mon, ...generated.dex[mon.id] }));
const byId = new Map(pokemon.map(mon => [mon.id, mon]));
const owners = new Map<number, number>();

for (const { owner, sprite, ...form } of LEAGUE_ALTERNATE_FORMS) {
  const mon: Pokemon = { ...byId.get(owner)!, ...form, sprite: pokemonSpriteUrl(sprite ?? form.id) };
  pokemon.push(mon);
  byId.set(mon.id, mon);
  owners.set(mon.id, owner);
}

const children = new Map<number, Pokemon[]>();
const parents = new Map<number, Pokemon[]>();
for (const mon of pokemon) {
  if (mon.evolvesFrom === null) continue;
  children.set(mon.evolvesFrom, [...(children.get(mon.evolvesFrom) ?? []), mon]);
  parents.set(mon.id, [byId.get(mon.evolvesFrom)!]);
}
for (const [parentId, childId] of generated.extraEvolutions) {
  const parent = byId.get(parentId)!;
  const child = byId.get(childId)!;
  children.set(parentId, [...(children.get(parentId) ?? []), child]);
  parents.set(childId, [...(parents.get(childId) ?? []), parent]);
}

function ancestors(mon: Pokemon): Pokemon[][] {
  const preceding = parents.get(mon.id);
  return preceding ? preceding.flatMap(parent => ancestors(parent).map(path => [...path, mon])) : [[mon]];
}

function descendants(mon: Pokemon): Pokemon[][] {
  const following = children.get(mon.id);
  return following ? following.flatMap(child => descendants(child).map(path => [mon, ...path])) : [[mon]];
}

function getAllEvolutionLines(id: number): Pokemon[][] {
  const mon = byId.get(id);
  if (!mon) return [];
  return ancestors(mon).flatMap(prefix => descendants(mon).map(suffix => [...prefix, ...suffix.slice(1)]));
}

export const getPokemonById = (id: number): Pokemon | undefined => byId.get(id);
export const getAllPokemon = (): Pokemon[] => pokemon;
export const getEvolutionLine = (id: number): Pokemon[] => getAllEvolutionLines(id)[0] ?? [];
const leagueFormOwnerId = (id: number): number => owners.get(id) ?? id;

const species = pokemon.filter(mon => mon.id <= 1025);
const orderOwners = new Map(owners);
for (const mon of pokemon) {
  if (mon.id <= 1025 || orderOwners.has(mon.id)) continue;
  const owner = species.find(base => mon.name.startsWith(`${base.name}-`));
  if (owner) orderOwners.set(mon.id, owner.id);
}

function speciesId(id: number): number {
  while (orderOwners.has(id)) id = orderOwners.get(id)!;
  return id;
}

const formOrder = (id: number): number => id === speciesId(id) ? 0 : id === 10085 ? 10079 : id;

const laterFormLineIds = new Set(pokemon
  .filter(mon => mon.generation > byId.get(speciesId(mon.id))!.generation)
  .map(mon => mon.id));
for (const id of laterFormLineIds) {
  for (const child of children.get(id) ?? []) laterFormLineIds.add(child.id);
}

const compareBrowserOrder = (a: number, b: number): number =>
  Number(laterFormLineIds.has(a)) - Number(laterFormLineIds.has(b))
  || speciesId(a) - speciesId(b) || formOrder(a) - formOrder(b);

function leagueFavoritePickerId(id: number): number | undefined {
  const remapped = ({
    10179: 10178, 10180: 10179, 10191: 10227,
    10318: 10147, 10323: 11006, 10324: 11007,
  } as Record<number, number>)[id] ?? id;
  if (byId.has(remapped)) return remapped;
  const owner = (favoriteBrowserIds as Record<number, number>)[id];
  return byId.has(owner) ? owner : undefined;
}

export function branchEndingAt(id: number, selectedIds: readonly number[] = [id]): number[] {
  const lines = getAllEvolutionLines(id);
  const line = lines.find(path => selectedIds.every(selected => path.some(mon => mon.id === selected))) ?? lines[0];
  return line ? line.slice(0, line.findIndex(mon => mon.id === id) + 1).map(mon => mon.id) : [];
}

export const leaguePokemonDataSource: PokemonDataSource = {
  pokemon,
  getPokemonById,
  getAllEvolutionLines,
  includeEvolutionItemForms: true,
  archetypeMemberId: leagueFormOwnerId,
  favoritePickerId: leagueFavoritePickerId,
  compareBrowserOrder,
  standaloneGroupId: id => STANDALONE_FORM_IDS.has(id) ? -id : byId.get(id)!.evolutionChainId,
};
