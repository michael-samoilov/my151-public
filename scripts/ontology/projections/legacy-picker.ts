/**
 * Today's Favorite Picker catalog, rebuilt from the ontology: the records allPickerMons() and
 * pickerPokemonMetadata() return. The parity test proves them equal. Phase 2 replaces the Picker's
 * own catalog with a projection, and this file with it.
 */
import type { PickerMon } from '../../../src/favorites/model/catalog';
import { revisedSprite } from '../../../src/lib/spriteUrl';
import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm, StateKind } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, type DexRow } from './dex';

const POWER_UP: ReadonlySet<StateKind> = new Set(['mega', 'primal', 'gigantamax']);
export const isPowerUp = (form: ResolvedForm): boolean => form.states.some((state) => POWER_UP.has(state.kind));

export const pickerId = (ontology: Ontology, form: ResolvedForm): number => ontology.authored.legacy.picker.ids[form.id] ?? form.appId;

function regionOf(ontology: Ontology, form: ResolvedForm): string | null {
  return form.states.length ? regionOf(ontology, ontology.forms.get(form.enteredFrom[0])!) : form.coordinates.region;
}

/** The Picker's ownerId: a Dex row owns itself; a form of a regional Dex row belongs to it; everything else to the species. */
export function pickerOwner(ontology: Ontology, form: ResolvedForm): ResolvedForm {
  const legacyOwner = ontology.authored.legacy.picker.owners[form.id];
  if (legacyOwner) return ontology.forms.get(legacyOwner)!;
  if (form.tools.dex === 'in') return form;
  const species = ontology.species.get(form.species)!;
  const region = regionOf(ontology, form);
  const members = species.forms.map((id) => ontology.forms.get(id)!);
  const regional = region && members.find((other) =>
    other.tools.dex === 'in' && other.states.length === 0 && other.coordinates.region === region
    && Object.keys(other.coordinates.variety).length === 0 && other.coordinates.sex === null);
  return regional || members[0];
}

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
