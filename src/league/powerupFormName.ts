import { pokemonLabel } from '@/i18n';
import type { PowerupForm } from './model/powerups';

export function powerupFormName(form: PowerupForm): string {
  const label = form.id === 10227 ? pokemonLabel(892, form.label, 'picker:10227') : pokemonLabel(form.id, form.label);
  return label.pending ? form.label : label.full;
}
