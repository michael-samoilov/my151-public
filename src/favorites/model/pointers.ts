import { TYPE_AXIS, GEN_AXIS, cellKey, isFavoriteLegendary, type GenAxisId, type TypeAxisId } from './cells';

/**
 * Favorite cells store a pointer to a form that already sits on that row or
 * column. They do not retarget. Drop the pointer when that form leaves.
 */
export function pointerPool(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Record<string, number>,
): number[] {
  if (isFavoriteLegendary(type, gen)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  const add = (id: number | undefined) => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  if (type === 'legendary' && gen === 'legendary') {
    for (const g of GEN_AXIS) {
      if (g === 'legendary' || g === 'favorite') continue;
      add(fills[cellKey('legendary', g)]);
    }
    for (const t of TYPE_AXIS) {
      if (t === 'legendary' || t === 'favorite') continue;
      add(fills[cellKey(t, 'legendary')]);
    }
    return ids;
  }

  if (gen === 'favorite' && type !== 'favorite') {
    for (const g of GEN_AXIS) {
      if (g === 'favorite') continue;
      add(fills[cellKey(type, g)]);
    }
    return ids;
  }

  if (type === 'favorite' && gen !== 'favorite') {
    for (const t of TYPE_AXIS) {
      if (t === 'favorite') continue;
      add(fills[cellKey(t, gen)]);
    }
    return ids;
  }

  if (type === 'favorite' && gen === 'favorite') {
    for (const t of TYPE_AXIS) {
      if (t === 'favorite') continue;
      add(fills[cellKey(t, 'favorite')]);
    }
    for (const g of GEN_AXIS) {
      if (g === 'favorite') continue;
      add(fills[cellKey('favorite', g)]);
    }
    return ids;
  }

  return ids;
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
