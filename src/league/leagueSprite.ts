import { pokemonSpriteUrl, shinySpriteUrl } from '@/lib/spriteUrl';
import { getPokemonById } from './data/catalog';
import type { PowerupForm } from './model/powerups';

/**
 * The sprite a league card, its home row, or its export draws: the powerup
 * form's or the Pokémon's own, shiny when the line is and that art has a shiny.
 */
export function leagueSpriteUrl(pokemonId: number, form: PowerupForm | null, shiny: boolean): string;
export function leagueSpriteUrl(pokemonId: number | null, form: PowerupForm | null, shiny: boolean): string | null;
export function leagueSpriteUrl(pokemonId: number | null, form: PowerupForm | null, shiny: boolean): string | null {
  const normal = form ? pokemonSpriteUrl(form.id)
    : pokemonId === null ? null
      : getPokemonById(pokemonId)?.sprite ?? pokemonSpriteUrl(pokemonId);
  if (normal === null) return null;
  return (shiny ? shinySpriteUrl(normal) : null) ?? normal;
}
