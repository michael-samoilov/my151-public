import { GEN_STOPS } from '@/components/shared/GenBadge';
import { type GenNumber } from '../model/cells';

import romanPaths from '../fonts/roman-disc-paths.json';
const ROMAN_DISC_STROKE = 1.25;

function gradStops(stops: { offset: string; color: string }[]): string {
  return stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
}

function buildRomanDisc(gen: GenNumber, stops: { offset: string; color: string }[]): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${gradStops(stops)}</linearGradient></defs>`,
    '<circle cx="16" cy="16" r="15" fill="url(#g)" stroke="#d4d4d8" stroke-width="0.5"/>',
    `<path d="${romanPaths[String(gen) as keyof typeof romanPaths]}" fill="white" stroke="rgba(0,0,0,0.85)" stroke-width="${ROMAN_DISC_STROKE}" stroke-linejoin="round" paint-order="stroke"/>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ROMAN_URIS = {} as Record<GenNumber, string>;
for (const gen of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
  ROMAN_URIS[gen] = buildRomanDisc(gen, GEN_STOPS[gen]);
}

