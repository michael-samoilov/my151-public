import { pokemonLabel } from '@/i18n';
import { formLabel, fullPokemonName, type PokemonLabel } from '@/i18n/names';
import { getPickerMon, isRegional, pickerNameId, type PickerMon } from '../model/catalog';
import { englishPickerName } from '../pickerDisplayNames';

/** The name a sprite tile shows in its alt text, label, and tooltip. */
export function pickerLabelOf(mon: PickerMon): PokemonLabel {
  const id = pickerNameId(mon);
  const label = mon.id === 10227
    ? pokemonLabel(892, mon.name, 'picker:10227')
    : pokemonLabel(id, mon.name);
  if (label.pending) {
    const full = englishPickerName(mon);
    return { name: full, full, mark: null, pending: false };
  }
  // A named sub-form can inherit a regional identity, for example Galarian
  // Darmanitan's Zen Mode. Keep both, rather than collapsing it to the base G.
  const owner = getPickerMon(mon.ownerId);
  if (owner && owner.id !== mon.id && isRegional(mon) && !label.mark) {
    const regional = pokemonLabel(pickerNameId(owner), owner.name);
    if (regional.mark) return { ...label, mark: regional.mark,
      full: fullPokemonName(regional.full, formLabel(id) ?? undefined) };
  }
  if (mon.name.endsWith('-female') && !formLabel(id)) {
    return { ...label, name: `${label.name} ♀`, full: `${label.full} ♀` };
  }
  return label;
}

/** Full names stay available to search, image alternatives and accessible labels. */
export function labelOf(mon: PickerMon): string { return pickerLabelOf(mon).full; }
