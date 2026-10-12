import { SECTION_TYPE } from '@/data/section-types';
import { typeGlyphPath } from '@/data/type-ids';
import pokeball from '@/assets/glyphs/pokeball.svg?url';
import legendary from '@/assets/glyphs/legendary.svg?url';

/** Concept sections that have their own glyph instead of a type symbol. The
 *  legendary ring is the favorite picker's legendary header. */
const CONCEPT_GLYPH: Record<string, string> = { starter: pokeball, legendary, mythical: legendary };

/** The recolourable alpha mask of a section's glyph, or null for the 4-point
 *  star. The View page's corner spandrels, the dex export, and the Build tab's
 *  empty section boxes all draw it. */
export function sectionGlyphMask(sectionId: string): string | null {
  const concept = CONCEPT_GLYPH[sectionId];
  if (concept) return concept;
  const type = SECTION_TYPE[sectionId];
  return type ? typeGlyphPath(type) : null;
}
