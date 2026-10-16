import type { Locale } from '@/i18n/config';
import { formatFullPokemonName, pokemonNameContext } from '@/i18n/fullPokemonName';
import { getPickerMon, pickerNameId, type PickerMon } from './model/catalog';

export interface PickerNameTables {
  locale: Locale;
  species: readonly string[];
  speciesIds: Readonly<Record<string, number>>;
  descriptors: Readonly<Record<string, string>>;
}

export function pickerFullName(mon: PickerMon, tables: PickerNameTables): string {
  const id = pickerNameId(mon);
  const owner = getPickerMon(mon.ownerId);
  const ownerId = owner ? pickerNameId(owner) : mon.ownerId;
  const speciesId = tables.speciesIds[id] ?? (id <= 1025 ? id : tables.speciesIds[ownerId] ?? ownerId);
  const species = tables.species[speciesId - 1] ?? 'Pokémon';
  const key = mon.id === 10227 ? 'picker:10227' : id;
  let descriptor = tables.descriptors[key];
  const context = pokemonNameContext(id, mon.name, tables.descriptors, tables.locale);
  if (!descriptor && id > 1025 && !mon.name.endsWith('-female')) {
    const ownerSlug = owner?.name;
    const suffix = ownerSlug && mon.name.startsWith(`${ownerSlug}-`)
      ? mon.name.slice(ownerSlug.length + 1)
      : '';
    if (suffix) descriptor = suffix.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  return formatFullPokemonName(species, descriptor, context);
}
