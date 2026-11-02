import { GEN_STOPS } from '@/components/shared/GenBadge';
import { localeUppercase, raw, t } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeNaturalWidth } from '@/lib/typeBadgeFit';
import { localeTypeLabels } from '@/components/shared/typeBadgeSvg';
import { ROMAN, type ExtraTypeAxis, type GenNumber } from '../model/cells';
import romanGlyphs from '../fonts/roman-badge-glyphs.json';

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

const BADGE_SHADE: Record<string, string> = {
  '#C0C0C0': '#B3B3B3',
  '#7FC8E8': '#75BDDD',
  '#AACCEE': '#96B7D9',
  '#FFAACC': '#EF9BBD',
  '#F5A623': '#F2A31E',
};

export const GEN_BADGE_FILL = Object.fromEntries(
  Object.entries(GEN_FILL).map(([gen, stops]) => [gen, stops.map(([offset, color]) => [offset, BADGE_SHADE[color] ?? color] as const)]),
) as unknown as Record<GenNumber, BadgeStops>;

export const WORD_BADGE_MARGIN = 22;

export function generationOutlined(gen: GenNumber): boolean {
  return gen === 5;
}

export function generationLabel(gen: GenNumber): string {
  return t('favorites.axis.generation', { gen: ROMAN[gen] });
}

export type GenerationWord = {
  before: string;
  after: string;
  numeral: { d: string; x: number }[];
  scale: number;
  width: number;
};

export function generationWord(gen: GenNumber): GenerationWord {
  const [before, after = ''] = raw('favorites.axis.generation').split('{gen}');
  const scale = TYPE_BADGE.capHeightRatio / romanGlyphs.capHeight;
  let x = 0;
  const numeral = [...ROMAN[gen]].map((letter) => {
    const glyph = romanGlyphs.glyphs[letter as keyof typeof romanGlyphs.glyphs];
    const at = x;
    x += glyph.advance + romanGlyphs.tracking;
    return { d: glyph.d, x: at };
  });
  return { before: localeUppercase(before), after: localeUppercase(after), numeral, scale, width: (x - romanGlyphs.tracking) * scale };
}

let unitsCache: { key: string; units: number } | null = null;

export function generationBadgeUnits(): number {
  const words = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(generationWord);
  const cohort = localeTypeLabels();
  const key = `${words.map((word) => word.before + word.after).join('|')}|${typeof document !== 'undefined' ? document.fonts?.status : ''}`;
  if (unitsCache?.key === key) return unitsCache.units;
  const widest = Math.max(...words.map((word) => typeBadgeNaturalWidth(word.before + word.after, cohort, word.width) ?? 0));
  const units = Math.max(TYPE_BADGE_W, Math.ceil(widest + 2 * WORD_BADGE_MARGIN + 2));
  unitsCache = { key, units };
  return units;
}
