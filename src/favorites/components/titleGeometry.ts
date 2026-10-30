import { TYPE_BADGE_ASPECT, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { displayCoordinate } from './coordinatePresentation';
import { generationBadgeUnits } from './badgeStyle';
import type { GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber } from '../model/cells';

/** The type and gen badges' height in the picker header; the header's pills match it. */
export const TITLE_BADGE_PX = 22;

/** The title's width in units of its height, and how many gaps it has. */
export function titleUnits(type: TypeAxisId, gen: GenAxisId): { aspect: number; gaps: number } {
  const display = displayCoordinate(type, gen);
  if (display.gen == null) return { aspect: TYPE_BADGE_ASPECT, gaps: 0 };
  return { aspect: TYPE_BADGE_ASPECT + (isGenNumber(display.gen) ? generationBadgeUnits() / TYPE_BADGE_H : TYPE_BADGE_ASPECT), gaps: 1 };
}

/** The title's width with its badges at the full TITLE_BADGE_PX. */
export function pickerTitleFullWidth(type: TypeAxisId, gen: GenAxisId, gapPx: number): number {
  const { aspect, gaps } = titleUnits(type, gen);
  return TITLE_BADGE_PX * aspect + gaps * gapPx;
}
