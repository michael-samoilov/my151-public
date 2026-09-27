import { pokemonLabel } from '@/i18n';
import type { PickerMon } from '../model/catalog';

/** The name a sprite tile shows in its alt text, label, and tooltip. */
export function labelOf(mon: PickerMon): string {
  if (mon.source === 'powerup') return mon.name;
  const label = pokemonLabel(mon.id, mon.name);
  return label.pending ? mon.name : label.full;
}
