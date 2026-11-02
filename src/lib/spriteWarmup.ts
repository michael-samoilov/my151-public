import type { Pokemon } from '@/types/pokemon';
import { ARCHETYPES } from '@/data/archetypes';
import { CATEGORIES } from '@/data/categories';
import { BUILD_GROUPS, type BuildGroup } from '@/data/slot-template';
import { getAllPokemon, getEvolutionChainIds, getPokemonById } from '@/hooks/usePokemonData';
import { whenIdle } from '@/lib/whenIdle';

/**
 * Background download of the sprites a visitor is likely to see next, so the
 * Pokédex picker opens with its sprites already in the browser cache.
 *
 * Only a first screen of each list is warmed: every section in full is most of
 * the catalog, about 0.8 MB, which a phone on a metered plan should not pay for
 * pickers it never opens. A section the pointer rests on moves to the front.
 */

/** About one phone screen of a section's picker (a 390x664 sheet shows 4 rows of 6). */
const FIRST_SCREEN = 24;
/** Each sprite is under 1 KB, so a few at a time keep the link free for what the visitor taps. */
const MAX_IN_FLIGHT = 4;
const STARTER_TYPES = ['grass', 'fire', 'water'] as const;

const byGenerationThenId = (a: Pokemon, b: Pokemon) => a.generation - b.generation || a.id - b.id;

/** Sprites of the evolution lines through `ids`, in order, as the picker draws them. */
function lineSprites(ids: Iterable<number>, limit: number): string[] {
  const sprites: string[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    for (const memberId of getEvolutionChainIds(id)) {
      if (seen.has(memberId)) continue;
      seen.add(memberId);
      const sprite = getPokemonById(memberId)?.sprite;
      if (sprite) sprites.push(sprite);
      if (sprites.length >= limit) return sprites;
    }
  }
  return sprites;
}

const generationOf = (id: number) => getPokemonById(id)?.generation ?? Infinity;

/** A section's Pokémon in picker order: its own subgroups if it has them, else generation first, then the archetype's curated order. */
function sectionIds(filterType: 'archetype' | 'category' | null, filterId: string | null): number[] {
  if (filterType === 'archetype') {
    const archetype = ARCHETYPES.find((a) => a.id === filterId);
    if (archetype?.subgroups) return archetype.subgroups.flatMap((sub) => sub.pokemonIds);
    return [...(archetype?.pokemonIds ?? [])].sort((a, b) => generationOf(a) - generationOf(b));
  }
  const category = filterType === 'category' ? CATEGORIES.find((c) => c.id === filterId) : undefined;
  const pool = category ? getAllPokemon().filter(category.filter) : getAllPokemon();
  return [...pool].sort(byGenerationThenId).map((p) => p.id);
}

/** What a section's picker shows first: each starter type's picker in full, else about one phone screen. */
function sectionSprites(group: BuildGroup): string[] {
  if (group.id === 'starter') {
    const starters = getAllPokemon().filter((p) => CATEGORIES.find((c) => c.id === 'starter')!.filter(p));
    return STARTER_TYPES.flatMap((type) =>
      lineSprites(starters.filter((p) => p.types.includes(type)).sort(byGenerationThenId).map((p) => p.id), Infinity));
  }
  return lineSprites(sectionIds(group.filterType, group.filterId), FIRST_SCREEN);
}

/**
 * Sprite URLs in the order to warm them: the visitor's own Pokémon first (what
 * the grid and the View page show), then each section's picker in page order,
 * Starters first.
 */
export function spriteWarmupPlan(sections: Readonly<Record<string, readonly number[]>>): string[] {
  const placed = Object.values(sections).flat().map((id) => getPokemonById(id)?.sprite).filter((s): s is string => Boolean(s));
  return [...new Set([...placed, ...BUILD_GROUPS.flatMap(sectionSprites)])];
}

let queue: string[] = [];
const started = new Set<string>();
// platform: The browser can collect an unreferenced Image mid-load, and that Image then fires neither load nor error.
const inFlight = new Set<HTMLImageElement>();
let paused = false;
let pumpScheduled = false;

// platform: Safari has no requestIdleCallback, so whenIdle waits the full 200 ms cap there.
function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  whenIdle(() => {
    pumpScheduled = false;
    while (!paused && inFlight.size < MAX_IN_FLIGHT && queue.length > 0) {
      const img = new Image();
      img.fetchPriority = 'low';
      img.onload = img.onerror = () => {
        inFlight.delete(img);
        schedulePump();
      };
      inFlight.add(img);
      const url = queue.shift()!;
      started.add(url);
      img.src = url;
    }
  }, 200);
}

/** Data Saver and 2G mean the visitor pays for every byte, so nothing is fetched ahead. */
function warmupAllowed() {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return typeof Image !== 'undefined' && !conn?.saveData && !conn?.effectiveType?.endsWith('2g');
}

function enqueue(urls: readonly string[], first: boolean) {
  const fresh = urls.filter((url) => !started.has(url));
  queue = [...new Set(first ? [...fresh, ...queue] : [...queue, ...fresh])];
  schedulePump();
}

export function warmSprites(urls: readonly string[], first = false) {
  if (warmupAllowed()) enqueue(urls, first);
}

/** A section the pointer rests on is the likeliest next tap, so its picker goes first. */
export function warmSectionFirst(sectionId: string) {
  const group = BUILD_GROUPS.find((g) => g.id === sectionId);
  if (group && warmupAllowed()) enqueue(sectionSprites(group), true);
}

/** While a picker is open its own sprites come first, so the warm-up waits. */
export function pauseSpriteWarmup(pause: boolean) {
  paused = pause;
  schedulePump();
}
