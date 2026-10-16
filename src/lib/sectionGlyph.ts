import { SECTION_TYPE } from '@/data/section-types';
import { typeGlyphPath } from '@/data/type-ids';
import pokeball from '@/assets/glyphs/pokeball.svg?url';
import legendary from '@/assets/glyphs/legendary.svg?url&no-inline';

const CONCEPT_GLYPH: Record<string, string> = { starter: pokeball, legendary, mythical: legendary };

export function sectionGlyphMask(sectionId: string): string | null {
  const concept = CONCEPT_GLYPH[sectionId];
  if (concept) return concept;
  const type = SECTION_TYPE[sectionId];
  return type ? typeGlyphPath(type) : null;
}
