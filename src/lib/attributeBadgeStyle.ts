import { COLOR_NAMES, SHAPE_NAMES, type ColorName, type ShapeName } from '@/types/pokemon';
import { colorLabel, localeUppercase, shapeLabel, t } from '@/i18n';
import { TYPE_BADGE, TYPE_BADGE_W } from './typeBadgeGeometry';
import { typeBadgeFit, typeBadgeFontStack } from './typeBadgeFit';
import { TYPE_COLORS } from '@/data/type-colors';

/** Color badges and chart bars share the official type-badge palette. */
export const COLOR_BADGE_FILLS: Record<ColorName, string> = {
  black: TYPE_COLORS.dark, blue: TYPE_COLORS.water, brown: TYPE_COLORS.ground,
  gray: TYPE_COLORS.normal, green: TYPE_COLORS.grass, pink: TYPE_COLORS.fairy,
  purple: TYPE_COLORS.poison, red: TYPE_COLORS.fire, white: '#FFFFFF',
  yellow: TYPE_COLORS.electric,
};

export const colorBadgeTextFill = (color: ColorName): string => color === 'white' ? '#171717' : '#ffffff';

// The existing shape artwork is not perfectly centered within every source PNG.
// Its largest measured left-plus-right painted extent is 62.34 badge units.
// Reserve 64 before text, so the glyph-to-word gap clears the left inset too.
const SHAPE_TEXT_LEFT = 64;
const SHAPE_TEXT_RIGHT = TYPE_BADGE_W - (TYPE_BADGE.glyphCenterX - TYPE_BADGE.glyph / 2);

export type EvolutionRole = 'basic' | 'intermediate' | 'final' | 'standalone';
export const EVOLUTION_ROLES: EvolutionRole[] = ['basic', 'intermediate', 'final', 'standalone'];
export function evolutionLabel(role: EvolutionRole): string {
  return t(({ basic: 'favorites.stats.basic', intermediate: 'favorites.stats.middle', final: 'favorites.stats.final', standalone: 'favorites.stats.noEvo' } as const)[role]);
}

let shapeMeasureContext: CanvasRenderingContext2D | null = null;

export function attributeBadgeLayout(kind: 'color' | 'shape' | 'evolution', value: ColorName | ShapeName | EvolutionRole) {
  const spoken = kind === 'color' ? colorLabel(value as ColorName) : kind === 'shape' ? shapeLabel(value as ShapeName) : evolutionLabel(value as EvolutionRole);
  const label = localeUppercase(spoken);
  const cohort = kind === 'color' ? COLOR_NAMES.map(colorLabel) : kind === 'shape' ? SHAPE_NAMES.map(shapeLabel) : EVOLUTION_ROLES.map(evolutionLabel);
  let centerX = kind === 'color' ? TYPE_BADGE_W / 2 : (SHAPE_TEXT_LEFT + SHAPE_TEXT_RIGHT) / 2;
  const textWidth = kind === 'color' ? 156 : SHAPE_TEXT_RIGHT - SHAPE_TEXT_LEFT;
  const fit = { ...typeBadgeFit(label, cohort.map(localeUppercase), textWidth) };
  if (kind !== 'color' && typeof document !== 'undefined') {
    shapeMeasureContext ??= document.createElement('canvas').getContext('2d');
    if (shapeMeasureContext) {
      shapeMeasureContext.font = `${TYPE_BADGE.fontWeight} ${fit.fontSize}px ${typeBadgeFontStack()}`;
      shapeMeasureContext.textAlign = 'center';
      const ink = shapeMeasureContext.measureText(label);
      const inkWidth = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
      if (inkWidth > 0) {
        // Fit painted glyphs, not advance widths, which include unequal side bearings.
        // Short labels retain their natural width; long labels share the same bounds.
        fit.scaleX = Math.min(TYPE_BADGE.textScaleX, textWidth / inkWidth);
        centerX += (ink.actualBoundingBoxLeft - ink.actualBoundingBoxRight) * fit.scaleX / 2;
      }
    }
  }
  return { spoken, label, centerX, fit };
}
