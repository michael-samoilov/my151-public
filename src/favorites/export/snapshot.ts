import pokemonData from '@/data/pokemon.json';
import type { Pokemon } from '@/types/pokemon';
import { GEN_AXIS, GEN_NUMBERS, TYPE_AXIS, TYPES18, cellKey, type GenAxisId, type TypeAxisId } from '../model/cells';
import { getPickerMon, type PickerMon } from '../model/catalog';
import { eligibleFor, kindFor } from '../model/eligibility';
import { pointerPool } from '../model/pointers';

export interface FavoritesExportCell {
  key: string;
  type: TypeAxisId;
  generation: GenAxisId;
  kind: ReturnType<typeof kindFor>;
  mon: PickerMon | null;
}

export interface FavoritesCompletion {
  filled: number;
  total: number;
  picksFilled: number;
  picksTotal: number;
  pointersFilled: number;
  pointersTotal: number;
}

/** A validated input for export and completion UI. */
export interface FavoritesSnapshot {
  cells: FavoritesExportCell[];
  summary: FavoritesExportCell[];
  completion: FavoritesCompletion;
  uniquePicks: PickerMon[];
  species: Pokemon[];
}

const positions = GEN_AXIS.flatMap(generation => TYPE_AXIS.map(type => ({
  key: cellKey(type, generation), type, generation, kind: kindFor(type, generation),
})));
const candidates = new Map(positions.filter(p => p.kind === 'pick').map(p => [
  p.key, new Set(eligibleFor(p.type, p.generation).map(mon => mon.id)),
]));
const speciesById = new Map((pokemonData as Pokemon[]).map(mon => [mon.id, mon]));
const summaryKeys = [
  ...GEN_NUMBERS.map(gen => cellKey('favorite', gen)),
  ...TYPES18.map(type => cellKey(type, 'favorite')),
  cellKey('starter', 'favorite'), cellKey('legendary', 'legendary'),
  cellKey('gimmick', 'gimmick'), cellKey('favorite', 'favorite'),
];

export function buildFavoritesSnapshot(fills: Readonly<Record<string, number>>): FavoritesSnapshot {
  const valid: Record<string, number> = {};
  for (const position of positions) {
    const id = fills[position.key];
    if (position.kind === 'pick' && candidates.get(position.key)?.has(id)) valid[position.key] = id;
  }
  // Axis order places each pointer after all of its source cells.
  for (const position of positions) {
    const id = fills[position.key];
    if (position.kind === 'pointer' && getPickerMon(id)
      && pointerPool(position.type, position.generation, valid).includes(id)) valid[position.key] = id;
  }
  const cells = positions.map(position => ({ ...position, mon: getPickerMon(valid[position.key]) ?? null }));
  const byKey = new Map(cells.map(cell => [cell.key, cell]));
  const uniquePicks = [...new Map(cells.filter(cell => cell.kind === 'pick' && cell.mon)
    .map(cell => [cell.mon!.id, cell.mon!])).values()];
  const species = [...new Map(uniquePicks.flatMap(mon => {
    const owner = getPickerMon(mon.ownerId);
    const id = owner?.ownerId ?? mon.ownerId;
    const metadata = speciesById.get(id);
    return metadata ? [[metadata.id, metadata] as const] : [];
  })).values()];
  const picks = cells.filter(cell => cell.kind === 'pick');
  const pointers = cells.filter(cell => cell.kind === 'pointer');
  const picksFilled = picks.filter(cell => cell.mon).length;
  const pointersFilled = pointers.filter(cell => cell.mon).length;
  return {
    cells, summary: summaryKeys.map(key => byKey.get(key)!), uniquePicks, species,
    completion: { filled: picksFilled + pointersFilled, total: picks.length + pointers.length,
      picksFilled, picksTotal: picks.length, pointersFilled, pointersTotal: pointers.length },
  };
}
