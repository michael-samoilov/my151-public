import type { TypeName } from '@/types/pokemon';
import { TYPE_ICONS } from '@/data/type-icons';

export function typeIconPath(type: TypeName): string {
  return TYPE_ICONS[type].icon;
}

export function typeGlyphPath(type: TypeName): string {
  return TYPE_ICONS[type].glyph;
}
