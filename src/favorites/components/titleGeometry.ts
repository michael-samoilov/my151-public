import { TYPE_BADGE_ASPECT, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { displayCoordinate } from './coordinatePresentation';
import { generationBadgeUnits } from './badgeStyle';
import type { GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber } from '../model/cells';

export const TITLE_BADGE_PX = 22;

export function titleUnits(type: TypeAxisId, gen: GenAxisId): { aspect: number; gaps: number } {
  const display = displayCoordinate(type, gen);
  if (display.gen == null) return { aspect: TYPE_BADGE_ASPECT, gaps: 0 };
  return { aspect: TYPE_BADGE_ASPECT + (isGenNumber(display.gen) ? generationBadgeUnits() / TYPE_BADGE_H : TYPE_BADGE_ASPECT), gaps: 1 };
}

export function pickerTitleFullWidth(type: TypeAxisId, gen: GenAxisId, gapPx: number): number {
  const { aspect, gaps } = titleUnits(type, gen);
  return TITLE_BADGE_PX * aspect + gaps * gapPx;
}
