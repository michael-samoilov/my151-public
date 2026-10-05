import { COLOR_NAMES, SHAPE_NAMES, type ColorName, type ShapeName } from '@/types/pokemon';
import { COLOR_SWATCHES } from '@/data/classifications';
import { colorLabel, localeUppercase, shapeLabel } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_W } from './typeBadgeGeometry';
import { typeBadgeFit } from './typeBadgeFit';

/** Choose the higher WCAG contrast against a color badge's actual fill. */
export function colorBadgeText(color: ColorName): string {
  const hex = COLOR_SWATCHES[color];
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  };
  const luminance = .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5);
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}

export function attributeBadgeLayout(kind: 'color' | 'shape', value: ColorName | ShapeName) {
  const spoken = kind === 'color' ? colorLabel(value as ColorName) : shapeLabel(value as ShapeName);
  const label = localeUppercase(spoken);
  const cohort = kind === 'color' ? COLOR_NAMES.map(colorLabel) : SHAPE_NAMES.map(shapeLabel);
  const centerX = kind === 'color' ? TYPE_BADGE_W / 2 : TYPE_BADGE.textCenterX;
  return { spoken, label, centerX, fit: typeBadgeFit(label, cohort.map(localeUppercase), kind === 'color' ? 156 : 130) };
}
