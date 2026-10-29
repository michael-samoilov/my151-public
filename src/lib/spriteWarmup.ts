import type { Pokemon } from '@/types/pokemon';
import { ARCHETYPES } from '@/data/archetypes';
import { CATEGORIES } from '@/data/categories';
import { BUILD_GROUPS } from '@/data/slot-template';
import { getAllPokemon, getEvolutionChainIds, getPokemonById } from '@/hooks/usePokemonData';
import { whenIdle } from '@/lib/whenIdle';

/**
 * Background download of the sprites a visitor is likely to see next, so the
 * Pokédex picker opens with its sprites already in the browser cache.
 *
 * Only a first screen of each list is warmed: every section in full is most of
 * the catalog, about 0.8 MB, which a phone on a metered plan should not pay for
 * pickers it never opens.
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

/** A section's Pokémon in picker order: generation first, then the archetype's curated order. */
function sectionIds(filterType: 'archetype' | 'category' | null, filterId: string | null): number[] {
  if (filterType === 'archetype') {
    const curated = ARCHETYPES.find((a) => a.id === filterId)?.pokemonIds ?? [];
    return [...curated].sort((a, b) => generationOf(a) - generationOf(b));
  }
  const category = filterType === 'category' ? CATEGORIES.find((c) => c.id === filterId) : undefined;
  const pool = category ? getAllPokemon().filter(category.filter) : getAllPokemon();
  return [...pool].sort(byGenerationThenId).map((p) => p.id);
}

/**
 * Sprite URLs in the order to warm them: the visitor's own Pokémon first (what
 * the grid and the View page show), then each starter type's picker, then the
 * first screen of every other section's picker in page order.
 */
export function spriteWarmupPlan(sections: Readonly<Record<string, readonly number[]>>): string[] {
  const placed = Object.values(sections).flat();
  const starters = getAllPokemon().filter((p) => CATEGORIES.find((c) => c.id === 'starter')!.filter(p));
  const tiers = [
    placed.map((id) => getPokemonById(id)?.sprite).filter((s): s is string => Boolean(s)),
    ...STARTER_TYPES.map((type) =>
      lineSprites(starters.filter((p) => p.types.includes(type)).sort(byGenerationThenId).map((p) => p.id), Infinity)),
    ...BUILD_GROUPS.filter((g) => g.id !== 'starter').map((g) => lineSprites(sectionIds(g.filterType, g.filterId), FIRST_SCREEN)),
  ];
  return [...new Set(tiers.flat())];
}

let queue: string[] = [];
/** Held until each load settles: an unreferenced Image can be collected mid-load and never report back. */
const inFlight = new Set<HTMLImageElement>();
let paused = false;
let pumpScheduled = false;

/**
 * Starts the next loads when the main thread is idle, so a tap is never queued
 * behind them. The 200 ms cap matters on Safari, which has no idle callback
 * and falls back to a timer of that length.
 */
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
      img.src = queue.shift()!;
    }
  }, 200);
}

export function warmSprites(urls: readonly string[]) {
  if (typeof Image === 'undefined') return;
  queue = [...new Set([...queue, ...urls])];
  schedulePump();
}

/** While a picker is open its own sprites come first, so the warm-up waits. */
export function pauseSpriteWarmup(pause: boolean) {
  paused = pause;
  schedulePump();
}
