import { TYPE_NAMES, type TypeName, type Pokemon } from '@/types/pokemon';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import type { ButterflyRow } from './butterflyRow';
import { typeLabel } from '@/i18n';

export function countTypes(pokemon: Pokemon[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of TYPE_NAMES) counts[t] = 0;
  for (const p of pokemon) {
    for (const t of p.types) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

export function buildTypeRows(
  typeCounts: Record<string, number>,
  total: number,
  baselineProp: Record<string, number>,
): ButterflyRow[] {
  return TYPE_NAMES.map((t) => {
    const yourProportion = typeCounts[t] / total;
    const globalProportion = baselineProp[t];
    const deviation = globalProportion > 0 ? ((yourProportion / globalProportion) - 1) * 100 : 0;
    return {
      key: t,
      label: typeLabel(t),
      count: typeCounts[t],
      deviation,
      color: TYPE_COLORS[t as keyof typeof TYPE_COLORS],
      barOpacity: 1,
      icon: typeIconPath(t as TypeName),
    };
  });
}
