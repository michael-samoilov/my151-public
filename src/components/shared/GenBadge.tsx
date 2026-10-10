import { t } from '@/i18n';

/** Color stops for each generation's diagonal gradient (135deg) */
export const GEN_STOPS: Record<number, { offset: string; color: string }[]> = {
  1: [{ offset: '50%', color: '#DC0A2D' }, { offset: '50%', color: '#3B4CCA' }],
  2: [{ offset: '33%', color: '#DAA520' }, { offset: '33%', color: '#C0C0C0' }, { offset: '66%', color: '#C0C0C0' }, { offset: '66%', color: '#7FC8E8' }],
  3: [{ offset: '33%', color: '#A00000' }, { offset: '33%', color: '#0055BF' }, { offset: '66%', color: '#0055BF' }, { offset: '66%', color: '#00A86B' }],
  4: [{ offset: '50%', color: '#AACCEE' }, { offset: '50%', color: '#FFAACC' }],
  5: [{ offset: '50%', color: '#1a1a1a' }, { offset: '50%', color: '#f0f0f0' }],
  6: [{ offset: '50%', color: '#025DA6' }, { offset: '50%', color: '#EA1A3E' }],
  7: [{ offset: '50%', color: '#F5A623' }, { offset: '50%', color: '#5C4D9A' }],
  8: [{ offset: '50%', color: '#00A1E9' }, { offset: '50%', color: '#E3003A' }],
  9: [{ offset: '50%', color: '#E3350D' }, { offset: '50%', color: '#7B2D8E' }],
};

/** Build a data URI for a gen badge SVG image. Renders as a true image — no
 *  selectable text, no clipping at zoom boundaries, scales perfectly. */
function buildBadgeUri(gen: number, stops: { offset: string; color: string }[]): string {
  const gradStops = stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join('');
  // 2px padding around the circle prevents edge clipping at fractional zoom.
  // Use #g in source — encodeURIComponent converts it to %23g which the browser
  // decodes back to #g when parsing the data URI.
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    gradStops,
    '</linearGradient></defs>',
    '<circle cx="12" cy="12" r="11" fill="url(#g)"/>',
    `<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" fill="white" font-size="14" font-weight="800" font-family="system-ui,sans-serif" stroke="rgba(0,0,0,0.85)" stroke-width="2" paint-order="stroke">${gen}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Pre-computed data URIs — one per generation */
export const GEN_BADGE_URIS: Record<number, string> = {};
for (const [gen, stops] of Object.entries(GEN_STOPS)) {
  GEN_BADGE_URIS[Number(gen)] = buildBadgeUri(Number(gen), stops);
}
// Fallback for unknown gens
const FALLBACK_URI = buildBadgeUri(0, [{ offset: '100%', color: '#888' }]);

export function GenBadge({ gen, className }: { gen: number; className?: string }) {
  return (
    <img
      src={GEN_BADGE_URIS[gen] ?? FALLBACK_URI}
      className={className}
      alt={t('browser.genChip', { gen })}
      draggable={false}
    />
  );
}
