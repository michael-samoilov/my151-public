/**
 * Today's Favorite Picker catalog, rebuilt from the ontology: the records allPickerMons() and
 * pickerPokemonMetadata() return. The parity test proves them equal. Phase 2 replaces the Picker's
 * own catalog with a projection, and this file with it.
 */
import type { PickerMon } from '../../../src/favorites/model/catalog';
import { revisedSprite } from '../../../src/lib/spriteUrl';
import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, type DexRow } from './dex';
import { isPowerUp, pickerId, pickerOwner } from './owner';

export function pickerRecord(ontology: Ontology, form: ResolvedForm): PickerMon {
  const owner = pickerOwner(ontology, form);
  const powerup = isPowerUp(form);
  return {
    id: pickerId(ontology, form),
    name: ontology.authored.legacy.picker.names[form.id] ?? form.id,
    types: [...form.facts.types] as PickerMon['types'],
    generation: (powerup ? ontology.species.get(form.species)!.generation : form.generation) as PickerMon['generation'],
    sprite: revisedSprite(`/sprites/pokemon/${form.sprite}.png`),
    source: powerup ? 'powerup' : 'dex',
    ownerId: pickerId(ontology, owner),
  };
}

export function pickerRecords(ontology: Ontology): PickerMon[] {
  return [...ontology.forms.values()].filter((form) => form.tools.picker === 'in').map((form) => pickerRecord(ontology, form));
}

/** What pickerPokemonMetadata() returns: the owner's Dex row under the form's own facts. */
export function pickerMetadata(ontology: Ontology, form: ResolvedForm): Pokemon {
  const rows = dexRowsByAppId(ontology);
  const record = pickerRecord(ontology, form);
  const biological = rows.get(pickerOwner(ontology, form).appId)!;
  return {
    ...(biological as unknown as Pokemon),
    stats: form.facts.baseStats,
    bst: form.bst,
    color: form.facts.color as Pokemon['color'],
    eggGroups: [...form.facts.eggGroups] as Pokemon['eggGroups'],
    id: record.id,
    name: record.name,
    types: record.types,
    sprite: record.sprite,
    generation: record.generation,
    shape: form.facts.shape as Pokemon['shape'],
  };
}

const cachedRows = new WeakMap<Ontology, Map<number, DexRow>>();
function dexRowsByAppId(ontology: Ontology): Map<number, DexRow> {
  let rows = cachedRows.get(ontology);
  if (!rows) {
    rows = new Map(dexRows(ontology).map((row) => [row.id, row]));
    cachedRows.set(ontology, rows);
  }
  return rows;
}
