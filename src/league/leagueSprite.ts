import { pokemonSpriteUrl, shinySpriteUrl } from '@/lib/spriteUrl';
import { getPokemonById } from './data/catalog';
import type { PowerupForm } from './model/powerups';

export function leagueSpriteUrl(pokemonId: number, form: PowerupForm | null, shiny: boolean): string;
export function leagueSpriteUrl(pokemonId: number | null, form: PowerupForm | null, shiny: boolean): string | null;
export function leagueSpriteUrl(pokemonId: number | null, form: PowerupForm | null, shiny: boolean): string | null {
  const normal = form ? pokemonSpriteUrl(form.id)
    : pokemonId === null ? null
      : getPokemonById(pokemonId)?.sprite ?? pokemonSpriteUrl(pokemonId);
  if (normal === null) return null;
  return (shiny ? shinySpriteUrl(normal) : null) ?? normal;
}
