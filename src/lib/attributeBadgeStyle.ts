import { COLOR_NAMES, SHAPE_NAMES, type ColorName, type ShapeName } from '@/types/pokemon';
import { colorLabel, localeUppercase, shapeLabel } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_W } from './typeBadgeGeometry';
import { typeBadgeFit } from './typeBadgeFit';

/** Badge paint is separate from the classification colors used by chart data. */
export const COLOR_BADGE_FILLS: Record<ColorName, string> = {
  black: '#27272a', blue: '#2563eb', brown: '#92400e', gray: '#4b5563',
  green: '#25802d', pink: '#c52e79', purple: '#7c3aed', red: '#dc2626',
  white: '#707070', yellow: '#946c00',
};

// The existing shape artwork is not perfectly centered within every source PNG.
// Its largest measured left-plus-right painted extent is 62.34 badge units.
// Reserve 64 before text, so the glyph-to-word gap clears the left inset too.
const SHAPE_TEXT_LEFT = 64;
const SHAPE_TEXT_RIGHT = TYPE_BADGE_W - (TYPE_BADGE.glyphCenterX - TYPE_BADGE.glyph / 2);

export function attributeBadgeLayout(kind: 'color' | 'shape', value: ColorName | ShapeName) {
  const spoken = kind === 'color' ? colorLabel(value as ColorName) : shapeLabel(value as ShapeName);
  const label = localeUppercase(spoken);
  const cohort = kind === 'color' ? COLOR_NAMES.map(colorLabel) : SHAPE_NAMES.map(shapeLabel);
  const centerX = kind === 'color' ? TYPE_BADGE_W / 2 : (SHAPE_TEXT_LEFT + SHAPE_TEXT_RIGHT) / 2;
  return { spoken, label, centerX, fit: typeBadgeFit(label, cohort.map(localeUppercase), kind === 'color' ? 156 : SHAPE_TEXT_RIGHT - SHAPE_TEXT_LEFT) };
}
