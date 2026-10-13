import { useT } from '@/i18n';
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

import { ULTRA_BAND, MASTER_OUTLINE, MASTER_MARKS, type BallKind } from './ballShape';

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
