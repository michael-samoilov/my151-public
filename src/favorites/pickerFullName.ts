import type { Locale } from '@/i18n/config';
import { formatFullPokemonName, pokemonNameContext } from '@/i18n/fullPokemonName';
import { getPickerMon, pickerNameId, type PickerMon } from './model/catalog';

/** One locale's name catalogs, merged: the shared names and the picker's forms. */
export interface PickerNameTables {
  locale: Locale;
  /** Species names, indexed by national dex number - 1. */
  species: readonly string[];
  /** The national dex number of each form id. */
  speciesIds: Readonly<Record<string, number>>;
  /** Form descriptors by form id, and by `picker:<id>` for picker-only keys. */
  descriptors: Readonly<Record<string, string>>;
}

/**
 * A picker entry's full name, read from catalogs the caller passes in, so a
 * page can name every picker form without installing the picker's names.
 */
export function pickerFullName(mon: PickerMon, tables: PickerNameTables): string {
  const id = pickerNameId(mon);
  const owner = getPickerMon(mon.ownerId);
  const ownerId = owner ? pickerNameId(owner) : mon.ownerId;
  const speciesId = tables.speciesIds[id] ?? (id <= 1025 ? id : tables.speciesIds[ownerId] ?? ownerId);
  const species = tables.species[speciesId - 1] ?? 'Pokémon';
  const key = mon.id === 10227 ? 'picker:10227' : id;
  let descriptor = tables.descriptors[key];
  const context = pokemonNameContext(id, mon.name, tables.descriptors, tables.locale);
  // Future forms retain their known species and readable descriptor, never an ID.
  if (!descriptor && id > 1025 && !mon.name.endsWith('-female')) {
    const ownerSlug = owner?.name;
    const suffix = ownerSlug && mon.name.startsWith(`${ownerSlug}-`)
      ? mon.name.slice(ownerSlug.length + 1)
      : '';
    if (suffix) descriptor = suffix.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  return formatFullPokemonName(species, descriptor, context);
}
