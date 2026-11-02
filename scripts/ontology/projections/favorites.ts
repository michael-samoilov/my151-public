import type { PickerMon } from '../../../src/favorites/model/catalog';
import type { Pokemon } from '../../../src/types/pokemon';
import type { ResolvedForm } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';
import { dexRows, type DexRow } from './dex';
import { differingFields } from './diff';
import { isPowerUp, pickerOwner } from './owner';

export function pickerRecord(ontology: Ontology, form: ResolvedForm): PickerMon {
  const owner = pickerOwner(ontology, form);
  const powerup = isPowerUp(form);
  return {
    id: form.appId,
    name: ontology.authored.legacy.picker.names[form.id] ?? form.id,
    types: [...form.facts.types] as PickerMon['types'],
    generation: (powerup ? ontology.species.get(form.species)!.generation : form.generation) as PickerMon['generation'],
    sprite: spritePath(form.sprite),
    source: powerup ? 'powerup' : 'dex',
    ownerId: owner.appId,
  };
}

const spritePath = (stem: string): string => `/sprites/pokemon/${stem}.png`;

export function pickerRecords(ontology: Ontology): PickerMon[] {
  return [...ontology.forms.values()].filter((form) => form.tools.picker === 'in').map((form) => pickerRecord(ontology, form));
}

export function pickerMetadata(ontology: Ontology, form: ResolvedForm): Pokemon {
  const record = pickerRecord(ontology, form);
  return {
    ...biologicalRow(ontology, form),
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

const biologicalRow = (ontology: Ontology, form: ResolvedForm): Pokemon =>
  dexRowsByAppId(ontology).get(pickerOwner(ontology, form).appId)! as unknown as Pokemon;

type DexRecordFields = Partial<Pick<PickerMon, 'name' | 'types' | 'generation' | 'source' | 'ownerId'>> & { spriteStem?: string };

export interface PickerForm extends Partial<Pick<PickerMon, 'types' | 'generation' | 'source'>> {
  readonly id: number;
  readonly owner: number;
  readonly name: string;
  readonly spriteStem?: string;
}

export interface FavoritesProjection {
  readonly dexOverrides: Record<string, DexRecordFields>;
  readonly forms: readonly PickerForm[];
}

const METADATA_SKIP = ['id', 'name', 'types', 'sprite', 'generation'];

export function favoritesProjection(ontology: Ontology): FavoritesProjection {
  const byAppId = new Map<number, ResolvedForm>([...ontology.forms.values()].map((form) => [form.appId, form]));
  const records = new Map<number, PickerMon>();
  const dexOverrides: Record<string, DexRecordFields> = {};
  for (const row of dexRows(ontology)) {
    const form = byAppId.get(row.id)!;
    if (form.tools.picker !== 'in') throw new Error(`${form.id}: the Dex lists it and the Picker does not, so the Picker catalog would show it.`);
    const record = pickerRecord(ontology, form);
    if (record.id !== row.id) throw new Error(`${form.id}: Picker number ${record.id} differs from its Dex number ${row.id}.`);
    records.set(record.id, record);
    const { sprite, ...fields } = differingFields(record, {
      id: row.id, name: row.name, types: row.types, generation: row.generation, sprite: row.sprite!, source: 'dex', ownerId: record.id,
    } as PickerMon, ['id']);
    if (sprite) Object.assign(fields, { spriteStem: form.sprite });
    if (Object.keys(fields).length) dexOverrides[row.id] = fields;
  }
  const forms: PickerForm[] = [];
  for (const form of ontology.forms.values()) {
    if (form.tools.picker !== 'in' || form.tools.dex === 'in') continue;
    const record = pickerRecord(ontology, form);
    const owner = records.get(record.ownerId);
    if (!owner) throw new Error(`${form.id}: its Picker owner ${record.ownerId} is not a Dex row, so the Picker has no row to copy its fields from.`);
    records.set(record.id, record);
    const base: PickerMon = { ...owner, sprite: spritePath(String(record.id)), source: 'dex' };
    const fields = differingFields(record, base, ['id', 'name', 'ownerId', 'sprite']);
    forms.push({
      id: record.id,
      owner: owner.id,
      name: record.name,
      ...(form.sprite === String(record.id) ? {} : { spriteStem: form.sprite }),
      ...fields,
    });
  }
  return { dexOverrides, forms };
}

export function favoritesMetadataProjection(ontology: Ontology): Record<string, Partial<Pokemon>> {
  const metadata: Record<string, Partial<Pokemon>> = {};
  for (const form of ontology.forms.values()) {
    if (form.tools.picker !== 'in') continue;
    const full = pickerMetadata(ontology, form);
    const fields = differingFields(full, { ...biologicalRow(ontology, form) }, METADATA_SKIP);
    if (Object.keys(fields).length) metadata[full.id] = fields;
  }
  return metadata;
}

export function pickerV1Numbers(ontology: Ontology): Record<string, number> {
  return Object.fromEntries(Object.entries(ontology.authored.legacy.picker.v1Ids)
    .map(([form, v1]) => [String(v1), ontology.forms.get(form as never)!.appId as number])
    .sort(([a], [b]) => Number(a) - Number(b)));
}

export const pickerV1NumbersJson = (ontology: Ontology): string => `${JSON.stringify(pickerV1Numbers(ontology))}\n`;
export const favoritesJson = (ontology: Ontology): string => `${JSON.stringify(favoritesProjection(ontology))}\n`;
export const favoritesMetadataJson = (ontology: Ontology): string => `${JSON.stringify(favoritesMetadataProjection(ontology))}\n`;

const cachedRows = new WeakMap<Ontology, Map<number, DexRow>>();
function dexRowsByAppId(ontology: Ontology): Map<number, DexRow> {
  let rows = cachedRows.get(ontology);
  if (!rows) {
    rows = new Map(dexRows(ontology).map((row) => [row.id, row]));
    cachedRows.set(ontology, rows);
  }
  return rows;
}
