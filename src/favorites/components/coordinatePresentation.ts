import { t, typeLabel } from '@/i18n';
import { isGenNumber, isTypeName, ROMAN, type GenAxisId, type TypeAxisId } from '../model/cells';

/** Presentation only: the stored summary coordinates keep their original keys. */
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
