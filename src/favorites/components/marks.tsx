import { useT } from '@/i18n';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import favoriteIcon from '../icons/favorite.svg?url';
import gimmickIcon from '../icons/gimmick.svg?url';
import legendaryIcon from '../icons/legendary.svg?url';
import starterIcon from '../icons/starter.svg?url';
import { ROMAN, type ExtraGenAxis, type ExtraTypeAxis, type GenNumber } from '../model/cells';

import { ROMAN_URIS } from './romanDiscAssets';

export function RomanDisc({ gen, size = 27 }: { gen: GenNumber; size?: number }) {
  const t = useT();
  return (
    <img
      src={ROMAN_URIS[gen]}
      alt={t('favorites.generation', { gen: ROMAN[gen] })}
      width={size}
      height={size}
      draggable={false}
      className="block shrink-0"
    />
  );
}

// White tiles with a colored edge. Each SVG notes where its symbols come from.
const EXTRA_ICON: Record<ExtraTypeAxis | ExtraGenAxis, string> = {
  starter: starterIcon,
  gimmick: gimmickIcon,
  legendary: legendaryIcon,
  favorite: favoriteIcon,
};

export function ExtraMark({
  id,
  size = 24,
}: {
  id: ExtraTypeAxis | ExtraGenAxis;
  size?: number;
}) {
  return (
    <img
      src={EXTRA_ICON[id]}
      alt=""
      width={size}
      height={size}
      draggable={false}
      data-testid={`favorites-axis-icon-${id}`}
      className="block shrink-0"
    />
  );
}

export function TypeIcon({ type, size = 24 }: { type: TypeName; size?: number }) {
  return (
    <img
      src={typeIconPath(type)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="block shrink-0 rounded-[4px]"
    />
  );
}

export type BallKind = 'poke' | 'ultra' | 'master';

// The balls are drawn head-on: centre (20, 20), outline r 18, seam at y 20.
// Ultra Ball: the yellow band is an H seen from above. Its legs are the ball
// cut by the planes x = ±8.5 and ±13, which show as vertical lines. Its
// crossbar runs over the top, half a leg wide, so its front edge is the
// circle r 15.75.
const ULTRA_BAND = 'M11.5 20V6.74A15.75 15.75 0 0 1 28.5 6.74V20M7 20V7.55M33 20V7.55';
// Master Ball: each dome is the circle r 8 at 13.5 from the centre, 48° off
// vertical, where it rises past the outline. A half ellipse on the chord
// closes it. The outline skips the two chords. The M's four strokes all lean
// 22.5° off vertical, so its two peaks and its valley are equal 45° angles.
const MASTER_OUTLINE = 'M12.82 3.49A18 18 0 0 1 27.18 3.49M37.17 14.59A18 18 0 1 1 2.83 14.59';
const MASTER_MARKS =
  'M2.83 14.59A8 8 0 0 1 12.82 3.49A2.99 7.46 -138 0 1 2.83 14.59Z' +
  'M27.18 3.49A8 8 0 0 1 37.17 14.59A2.99 7.46 -42 0 1 27.18 3.49Z' +
  'M15.86 11.25L17.93 6.25L20 11.25L22.07 6.25L24.14 11.25';

export function EmptyBall({ kind = 'poke', className }: { kind?: BallKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      aria-hidden
      overflow="visible"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <g transform="rotate(-30 20 20)">
        {kind === 'master' ? <path d={MASTER_OUTLINE} /> : <circle cx="20" cy="20" r="18" />}
        <line x1="2" y1="20" x2="14" y2="20" />
        <line x1="26" y1="20" x2="38" y2="20" />
        <circle cx="20" cy="20" r="6" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" stroke="none" />
        {kind === 'ultra' ? <path d={ULTRA_BAND} /> : null}
        {kind === 'master' ? <path d={MASTER_MARKS} strokeLinejoin="round" strokeLinecap="round" /> : null}
      </g>
    </svg>
  );
}

export { TYPE_COLORS };
