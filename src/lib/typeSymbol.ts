import type { TypeName } from '@/types/pokemon';
import { typeGlyphPath } from '@/data/type-ids';

/** The shared transparent SVG is also the recolourable CSS/canvas alpha mask. */
export function getTypeMask(type: TypeName): string {
  return typeGlyphPath(type);
}

export function ensureTypeMask(type: TypeName): Promise<string> {
  return Promise.resolve(typeGlyphPath(type));
}
