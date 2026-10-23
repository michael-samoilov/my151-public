import { pokemonLabel } from '@/i18n';
import { formLabel, fullPokemonName, type PokemonLabel } from '@/i18n/names';
import { genderFormOf, GENDER_MARKS } from '@/i18n/genderForms';
import { getPickerMon, isRegional, pickerNameId, type PickerMon } from '../model/catalog';
import { englishPickerName } from '../pickerDisplayNames';

export function pickerLabelOf(mon: PickerMon): PokemonLabel {
  const id = pickerNameId(mon);
  const label = mon.id === 10227
    ? pokemonLabel(892, mon.name, 'picker:10227')
    : pokemonLabel(id, mon.name);
  if (label.pending) {
    const full = englishPickerName(mon);
    const gender = genderFormOf(id, mon.name);
    return { name: gender ? full.replace(/\s*[♂♀]$/u, '') : full,
      full, mark: gender ? GENDER_MARKS[gender] : null, pending: false };
  }
  const owner = getPickerMon(mon.ownerId);
  if (owner && owner.id !== mon.id && isRegional(mon)) {
    const regional = pokemonLabel(pickerNameId(owner), owner.name);
    if (regional.mark) return { ...label, mark: label.mark ?? regional.mark,
      full: fullPokemonName(regional.full, formLabel(id) ?? undefined) };
  }
  return label;
}

export function labelOf(mon: PickerMon): string { return pickerLabelOf(mon).full; }
