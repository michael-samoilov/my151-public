import { pokemonLabel } from '@/i18n';
import { pickerNameId, type PickerMon } from '../model/catalog';

/** The name a sprite tile shows in its alt text, label, and tooltip. */
export function labelOf(mon: PickerMon): string {
  const id = pickerNameId(mon);
  const label = mon.id === 10227
    ? pokemonLabel(892, mon.name, 'picker:10227')
    : pokemonLabel(id, mon.name);
  if (label.pending) return mon.name;
  return mon.name.endsWith('-female') && label.full === label.name ? `${label.full} ♀` : label.full;
}
