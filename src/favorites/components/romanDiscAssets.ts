import { GEN_STOPS } from '@/components/shared/GenBadge';
import { ROMAN, type GenNumber } from '../model/cells';

const ROMAN_DISC_FS = 15;
// Round joins keep the outline one thickness at the points of V and X, where
// a mitred join reaches up to four times further out.
const ROMAN_DISC_STROKE = 1.25;
const ROMAN_DISC_TRACKING = -0.4;

function gradStops(stops: { offset: string; color: string }[]): string {
  return stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
}

function buildRomanDisc(label: string, stops: { offset: string; color: string }[]): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${gradStops(stops)}</linearGradient></defs>`,
    '<circle cx="16" cy="16" r="15" fill="url(#g)" stroke="#d4d4d8" stroke-width="0.5"/>',
    `<text x="16" y="15.5" text-anchor="middle" dominant-baseline="central" fill="white" font-size="${ROMAN_DISC_FS}" font-weight="800" font-family="system-ui,sans-serif" stroke="rgba(0,0,0,0.85)" stroke-width="${ROMAN_DISC_STROKE}" stroke-linejoin="round" paint-order="stroke" letter-spacing="${ROMAN_DISC_TRACKING}">${label}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ROMAN_URIS = {} as Record<GenNumber, string>;
for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
  ROMAN_URIS[gen] = buildRomanDisc(ROMAN[gen], GEN_STOPS[gen]);
}

