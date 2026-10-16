import { TYPE_COLORS } from '@/data/type-colors';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { AXIS_FILL } from './badgeStyle';
import { t, typeLabel } from '@/i18n';
import { isGenNumber, isTypeName, ROMAN, type GenAxisId, type TypeAxisId } from '../model/cells';

export function displayCoordinate(type: TypeAxisId, gen: GenAxisId): { type: TypeAxisId; gen?: GenAxisId } {
  if (type === gen) {
    if (type === 'favorite') return { type };
    if (type === 'gimmick' || type === 'legendary') return { type, gen: 'favorite' };
  }
  return { type, gen };
}

export function coordinateLabel(type: TypeAxisId, gen: GenAxisId): string {
  const display = displayCoordinate(type, gen);
  const typeName = isTypeName(display.type) ? typeLabel(display.type) : t(`favorites.axis.${display.type}`);
  if (display.gen == null) return typeName;
  const genName = isGenNumber(display.gen) ? t('favorites.generation', { gen: ROMAN[display.gen] }) : t(`favorites.axis.${display.gen}`);
  return `${genName} · ${typeName}`;
}

export function axisBackground(axis: TypeAxisId | GenAxisId): string {
  if (isGenNumber(axis)) return `linear-gradient(135deg, ${GEN_STOPS[axis].map(stop => `${stop.color} ${stop.offset}`).join(', ')})`;
  if (isTypeName(axis)) return TYPE_COLORS[axis];
  const fill = AXIS_FILL[axis];
  return typeof fill === 'string' ? fill : `linear-gradient(135deg, ${fill.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ')})`;
}
