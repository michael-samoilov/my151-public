import { GEN_STOPS } from '@/components/shared/GenBadge';
import { localeUppercase, t } from '@/i18n';
import { TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeNaturalWidth } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { ROMAN, type ExtraTypeAxis, type GenNumber } from '../model/cells';

export type BadgeStops = readonly (readonly [number, string])[];

export const AXIS_FILL: Record<ExtraTypeAxis, string | BadgeStops> = {
  starter: '#dc2626',
  gimmick: [[0, '#d27a22'], [0.22, '#b8941a'], [0.42, '#4f9a3a'], [0.62, '#2a86c2'], [0.8, '#6a4fc0'], [1, '#c0357f']],
  legendary: [[0, '#1e1b4b'], [0.35, '#4338ca'], [0.65, '#7c3aed'], [1, '#be185d']],
  favorite: [[0, '#7a5410'], [0.3, '#b8861f'], [0.5, '#caa033'], [0.7, '#a8781c'], [1, '#6e4a0c']],
};

export const GEN_FILL = Object.fromEntries(
  Object.entries(GEN_STOPS).map(([gen, stops]) => [gen, stops.map((s) => [parseFloat(s.offset) / 100, s.color] as const)]),
) as unknown as Record<GenNumber, BadgeStops>;

export const WORD_BADGE_MARGIN = 22;

export function generationLabel(gen: GenNumber): string {
  return t('favorites.axis.generation', { gen: ROMAN[gen] });
}

let unitsCache: { key: string; units: number } | null = null;

export function generationBadgeUnits(): number {
  const labels = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((gen) => localeUppercase(generationLabel(gen)));
  const cohort = localeTypeLabels();
  // Keyed by the font state too: a width measured against the fallback font
  // is thrown away once the webfont arrives.
  const key = `${labels.join('|')}|${typeof document !== 'undefined' ? document.fonts?.status : ''}`;
  if (unitsCache?.key === key) return unitsCache.units;
  const widest = Math.max(...labels.map((label) => typeBadgeNaturalWidth(label, cohort) ?? 0));
  const units = Math.max(TYPE_BADGE_W, Math.ceil(widest + 2 * WORD_BADGE_MARGIN + 2));
  unitsCache = { key, units };
  return units;
}
