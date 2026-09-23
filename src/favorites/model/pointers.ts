import { TYPE_AXIS, GEN_AXIS, cellKey, isFavoriteLegendary, isGenNumber, isTypeName, parseCellKey, type GenAxisId, type GenNumber, type TypeAxisId } from './cells';
import type { TypeName } from '@/types/pokemon';

export type PointerMark =
  | { source: 'gen'; value: GenNumber }
  | { source: 'type'; value: TypeName }
  | { source: 'starter' | 'gimmick' | 'legendary' };

function pointerSourceKeys(type: TypeAxisId, gen: GenAxisId): string[] {
  if (isFavoriteLegendary(type, gen)) return [];
  if (type === 'legendary' && gen === 'legendary') {
    return [
      ...GEN_AXIS.filter(isGenNumber).map((g) => cellKey('legendary', g)),
      ...TYPE_AXIS.filter(isTypeName).map((t) => cellKey(t, 'legendary')),
      cellKey('gimmick', 'legendary'),
    ];
  }
  if (gen === 'favorite' && type !== 'favorite') {
    return GEN_AXIS.filter((g) => g !== 'favorite').map((g) => cellKey(type, g));
  }
  if (type === 'favorite' && gen !== 'favorite') {
    return TYPE_AXIS.filter((t) => t !== 'favorite').map((t) => cellKey(t, gen));
  }
  if (type === 'favorite' && gen === 'favorite') {
    return [
      ...TYPE_AXIS.filter((t) => t !== 'favorite' && t !== 'legendary').map((t) => cellKey(t, 'favorite')),
      ...GEN_AXIS.filter((g) => g !== 'favorite' && g !== 'legendary').map((g) => cellKey('favorite', g)),
      cellKey('legendary', 'legendary'),
    ];
  }
  return [];
}

/**
 * Favorite cells store a pointer to a form that already sits on that row or
 * column. They do not retarget. Drop the pointer when that form leaves.
 */
export function pointerPool(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Record<string, number>,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const add = (id: number | undefined) => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  for (const key of pointerSourceKeys(type, gen)) add(fills[key]);
  return ids;
}

export function pointerMarks(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Record<string, number>,
  id: number,
): PointerMark[] {
  const marks: PointerMark[] = [];
  const seen = new Set<string>();
  const add = (mark: PointerMark) => {
    const key = `${mark.source}:${'value' in mark ? mark.value : ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      marks.push(mark);
    }
  };

  for (const key of pointerSourceKeys(type, gen)) {
    if (fills[key] !== id) continue;
    const source = parseCellKey(key);
    if (!source) continue;
    if (source.type === 'legendary' && source.gen === 'legendary') {
      add({ source: 'legendary' });
    } else if (type === 'favorite' && gen === 'favorite') {
      if (isTypeName(source.type)) add({ source: 'type', value: source.type });
      if (isGenNumber(source.gen)) add({ source: 'gen', value: source.gen });
    } else if (type === 'favorite' && isGenNumber(gen)) {
      if (isTypeName(source.type)) add({ source: 'type', value: source.type });
      else if (source.type === 'starter' || source.type === 'gimmick' || source.type === 'legendary') {
        add({ source: source.type });
      }
    } else if (gen === 'favorite') {
      if (isGenNumber(source.gen)) add({ source: 'gen', value: source.gen });
      else if (source.gen === 'legendary') add({ source: 'legendary' });
    } else {
      if (source.type === 'starter' || source.type === 'gimmick' || source.type === 'legendary') {
        add({ source: source.type });
      }
      if (source.gen === 'legendary') add({ source: 'legendary' });
    }
  }
  return marks;
}

export function prunePointers(fills: Record<string, number>): Record<string, number> {
  const next = { ...fills };
  for (const type of TYPE_AXIS) {
    for (const gen of GEN_AXIS) {
      if (type !== 'favorite' && gen !== 'favorite' && !(type === 'legendary' && gen === 'legendary')) {
        continue;
      }
      const key = cellKey(type, gen);
      const id = next[key];
      if (id == null) continue;
      if (!pointerPool(type, gen, next).includes(id)) delete next[key];
    }
  }
  return next;
}
