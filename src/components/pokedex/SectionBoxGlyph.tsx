import { SECTION_TYPE } from '@/data/section-types';
import { sectionGlyphMask } from '@/lib/sectionGlyph';
import type { TypeName } from '@/types/pokemon';
import star from '@/assets/glyphs/star.svg?url';

const CELL = '((100% - 1.75rem) / 6)';
const SIZE = 1.6;
const TURN = 15;
const INK_RISE = 0.518;
const OWN_RISE: Partial<Record<TypeName, number>> = { poison: (0.405 + INK_RISE) / 2 };
function drop(rise: number): number {
  return ((SIZE / 2 - 1 + rise * SIZE) / SIZE) * 100;
}

export function SectionBoxGlyph({ sectionId, color }: { sectionId: string; color: string }) {
  const mask = sectionGlyphMask(sectionId) ?? star;
  const type = SECTION_TYPE[sectionId];
  const rise = (type && OWN_RISE[type]) ?? INK_RISE;
  return (
    <div aria-hidden="true" data-audit-clip="intended" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]">
      <div
        className="absolute aspect-square"
        style={{
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
