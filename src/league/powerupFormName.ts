import { pokemonLabel } from '@/i18n';
import type { PowerupForm } from './model/powerups';

/**
 * A powerup form's full name, as the picker's tooltip spells it: "Mega
 * Charizard X", "メガガブリアス". Gigantamax Rapid Strike Urshifu's name sits
 * under `picker:10227`, because 10227 is Rapid Strike Urshifu itself.
 */
export function powerupFormName(form: PowerupForm): string {
  const label = form.id === 10227 ? pokemonLabel(892, form.label, 'picker:10227') : pokemonLabel(form.id, form.label);
  return label.pending ? form.label : label.full;
}
