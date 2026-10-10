import type { TypeName } from '@/types/pokemon';
import { TYPE_ICONS } from '@/data/type-icons';

/** The selected type symbol in the app's padded, coloured square. */
export function typeIconPath(type: TypeName): string {
  return TYPE_ICONS[type].icon;
}

/** Transparent white vector glyph. Contain-fit it inside the caller's box. */
export function typeGlyphPath(type: TypeName): string {
  return TYPE_ICONS[type].glyph;
}
