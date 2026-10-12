import englishNames from '@/i18n/names/en.json';
import englishForms from '@/i18n/picker-names/en.json';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { fullPokemonName } from '@/i18n/names';
import { pokemonNameContext } from '@/i18n/fullPokemonName';
import { getPickerMon, pickerNameId, type PickerMon } from './model/catalog';

// Only the picker bundles this canonical fallback. Other pages keep lazy names.
const speciesIds: Record<string, number> = { ...altFormSpecies, ...englishForms.species };
const descriptors: Record<string, string> = { ...englishNames.forms, ...englishForms.forms };

/** Friendly English names while the selected locale's catalog is in flight. */
export function englishPickerName(mon: PickerMon): string {
  const id = pickerNameId(mon);
  const owner = getPickerMon(mon.ownerId);
  const ownerId = owner ? pickerNameId(owner) : mon.ownerId;
  const speciesId = speciesIds[id] ?? (id <= 1025 ? id : speciesIds[ownerId] ?? ownerId);
  const species = englishNames.species[speciesId - 1] ?? 'Pokémon';
  const key = mon.id === 10227 ? 'picker:10227' : id;
  let descriptor = descriptors[key];
  const context = pokemonNameContext(id, mon.name, descriptors, 'en');
  // Future forms retain their known species and readable descriptor, never an ID.
  if (!descriptor && id > 1025 && !mon.name.endsWith('-female')) {
    const ownerSlug = owner?.name;
    const suffix = ownerSlug && mon.name.startsWith(`${ownerSlug}-`)
      ? mon.name.slice(ownerSlug.length + 1)
      : '';
    if (suffix) descriptor = suffix.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  return fullPokemonName(species, descriptor, context);
}
