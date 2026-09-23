import { GEN_STOPS } from '@/components/shared/GenBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { EXTRA_COLOR, ROMAN, type ExtraGenAxis, type ExtraTypeAxis, type GenNumber } from '../model/cells';

const ROMAN_DISC_FS = 15;
const ROMAN_DISC_STROKE = 1.25;
const ROMAN_DISC_TRACKING = -0.4;

function gradStops(stops: { offset: string; color: string }[]): string {
  return stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
}

function buildRomanDisc(label: string, stops: { offset: string; color: string }[]): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${gradStops(stops)}</linearGradient></defs>`,
    '<circle cx="16" cy="16" r="15" fill="url(#g)"/>',
    `<text x="16" y="16.5" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${ROMAN_DISC_FS}" font-weight="800" font-family="system-ui,sans-serif" stroke="rgba(0,0,0,0.85)" stroke-width="${ROMAN_DISC_STROKE}" paint-order="stroke" letter-spacing="${ROMAN_DISC_TRACKING}">${label}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const ROMAN_URIS = {} as Record<GenNumber, string>;
for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
  ROMAN_URIS[gen] = buildRomanDisc(ROMAN[gen], GEN_STOPS[gen]);
}

export function RomanDisc({ gen, size = 27 }: { gen: GenNumber; size?: number }) {
  return (
    <img
      src={ROMAN_URIS[gen]}
      alt={`Generation ${ROMAN[gen]}`}
      width={size}
      height={size}
      draggable={false}
      className="block shrink-0"
    />
  );
}

export function ExtraMark({
  id,
  size = 24,
}: {
  id: ExtraTypeAxis | ExtraGenAxis;
  size?: number;
}) {
  const color = EXTRA_COLOR[id];
  const ch = id === 'starter' ? 'S' : id === 'gimmick' ? 'G' : id === 'favorite' ? '★' : 'L';
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] font-extrabold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.55 }}
      aria-hidden
    >
      {ch}
    </span>
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

export function EmptyBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden overflow="visible">
      <g transform="rotate(-30 20 20)">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="2" y1="20" x2="14" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <line x1="26" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" />
      </g>
    </svg>
  );
}

export { TYPE_COLORS };
