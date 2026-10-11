import { getAllPokemon as getDexPokemon, type PokemonDataSource } from '@/hooks/usePokemonData';
import { pokemonShape } from '@/data/pokemonShape';
import { pokemonSpriteUrl } from '@/lib/spriteUrl';
import type { Pokemon } from '@/types/pokemon';
import formsData from './alternateForms.json';
import type { AlternatePickerForm } from '@/favorites/model/alternateForms';
import favoriteBrowserIds from '@/components/browser/favoriteBrowserIds.json';
import { ADDITIONAL_EVOLUTION_EDGES, FORM_PARENT_IDS, STANDALONE_FORM_IDS } from './formPolicy';

type FormMetadata = Partial<Pick<Pokemon,
  'stats' | 'bst' | 'shape' | 'color' | 'captureRate' | 'growthRate' | 'eggGroups'>>;
export const LEAGUE_ALTERNATE_FORMS = formsData as Array<AlternatePickerForm & { metadata?: FormMetadata }>;
const pokemon = getDexPokemon().map(mon => ({
  ...mon,
  evolvesFrom: Object.hasOwn(FORM_PARENT_IDS, mon.id) ? FORM_PARENT_IDS[mon.id] : mon.evolvesFrom,
}));
const byId = new Map(pokemon.map(mon => [mon.id, mon]));
const owners = new Map<number, number>();

for (const form of LEAGUE_ALTERNATE_FORMS) {
  const owner = byId.get(form.ownerId)!;
  const standalone = STANDALONE_FORM_IDS.has(form.id);
  const parent = standalone ? null
    : Object.hasOwn(FORM_PARENT_IDS, form.id) ? FORM_PARENT_IDS[form.id] : owner.evolvesFrom;
  const overrides = form.metadata ?? {};
  const mon: Pokemon = {
    ...owner,
    ...overrides,
    id: form.id,
    name: form.name,
    types: form.types,
    generation: form.generation ?? owner.generation,
    sprite: pokemonSpriteUrl(form.id),
    shape: pokemonShape(form.id, overrides.shape ?? owner.shape),
    evolvesFrom: parent,
    evolutionStage: parent === null ? 1 : owner.evolutionStage,
    evolutionLevel: parent === null ? null : owner.evolutionLevel,
    bst: overrides.bst ?? (overrides.stats
      ? Object.values(overrides.stats).reduce((total, stat) => total + stat, 0) : owner.bst),
  };
  pokemon.push(mon);
  byId.set(mon.id, mon);
  owners.set(mon.id, owner.id);
}

const children = new Map<number, Pokemon[]>();
const parents = new Map<number, Pokemon[]>();
for (const mon of pokemon) {
  if (mon.evolvesFrom === null) continue;
  children.set(mon.evolvesFrom, [...(children.get(mon.evolvesFrom) ?? []), mon]);
  parents.set(mon.id, [byId.get(mon.evolvesFrom)!]);
}
for (const [parentId, childId] of ADDITIONAL_EVOLUTION_EDGES) {
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

// Forms of older species follow the native species in their generation section.
// Keep their descendants there too, so a new species such as Obstagoon does
// not pull its regional evolution line back into the native-species order.
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
