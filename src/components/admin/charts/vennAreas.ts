import type { VennArea } from 'venn.js';
import type { ToolDef } from '../../../../api/_crossTool';

export function inclusive(id: string, regions: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(regions)) {
    if (key.split('+').includes(id)) n += count;
  }
  return n;
}

export function intersection(ids: string[], regions: Record<string, number>): number {
  let n = 0;
  for (const [key, count] of Object.entries(regions)) {
    const parts = key.split('+');
    if (ids.every((id) => parts.includes(id))) n += count;
  }
  return n;
}

/** Exclusive regions → venn.js areas (inclusive set sizes + pairwise overlap). */
export function areasFromRegions(regions: Record<string, number>, catalog: ToolDef[]): VennArea[] {
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const areas: VennArea[] = present.map((t) => ({
    sets: [t.short],
    size: inclusive(t.id, regions),
  }));
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      areas.push({
        sets: [present[i].short, present[j].short],
        size: intersection([present[i].id, present[j].id], regions),
      });
    }
  }
  if (present.length >= 3) {
    const size = intersection(present.map((t) => t.id), regions);
    if (size > 0) areas.push({ sets: present.map((t) => t.short), size });
  }
  return areas;
}
