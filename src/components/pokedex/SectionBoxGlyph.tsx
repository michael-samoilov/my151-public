import { SECTION_TYPE } from '@/data/section-types';
import { sectionGlyphMask } from '@/lib/sectionGlyph';
import type { TypeName } from '@/types/pokemon';
import star from '@/assets/glyphs/star.svg?url';

// One grid cell of the section box: grid-cols-6 with gap-1 and p-1, so six
// cells and seven 0.25rem gaps share the box width.
const CELL = '((100% - 1.75rem) / 6)';
/** The glyph's box, in cells. */
const SIZE = 1.6;
/** The glyph's turn, counter-clockwise. */
const TURN = 15;
/** Measured from the glyph SVGs after the turn: the ink rises at most 0.518 of
 *  the glyph box above its centre (Normal), and spreads at most 0.532 to either
 *  side (Poison), so 1.6 cells stays inside the two right-hand cells. */
const INK_RISE = 0.518;
/** Poison keeps its base low in the glyph, where the edge hides it. It rises
 *  halfway from the shared height to its own measured ink top (0.405), so part
 *  of the base shows. */
const OWN_RISE: Partial<Record<TypeName, number>> = { poison: (0.405 + INK_RISE) / 2 };
/** Lower the glyph until the point `rise` above its centre meets the top of a
 *  one-cell last row. */
function drop(rise: number): number {
  return ((SIZE / 2 - 1 + rise * SIZE) / SIZE) * 100;
}

/** The section's glyph, faint and turned 15°, in the two right-hand cells of
 *  the box's last row. The box's bottom edge cuts it off. The same glyph marks
 *  the section's corner spandrels on the View tab. */
export function SectionBoxGlyph({ sectionId, color }: { sectionId: string; color: string }) {
  const mask = sectionGlyphMask(sectionId) ?? star;
  const type = SECTION_TYPE[sectionId];
  const rise = (type && OWN_RISE[type]) ?? INK_RISE;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <div
        className="absolute aspect-square"
        style={{
          // Centred on the two right-hand cells and the gap between them.
          right: `calc(0.375rem + ${1 - SIZE / 2} * ${CELL})`,
          bottom: '0.25rem',
          width: `calc(${SIZE} * ${CELL})`,
          transform: `translateY(${drop(rise).toFixed(2)}%) rotate(-${TURN}deg)`,
          backgroundColor: color,
          opacity: 0.15,
          WebkitMaskImage: `url("${mask}")`,
          maskImage: `url("${mask}")`,
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
    </div>
  );
}
