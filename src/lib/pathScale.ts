import type { CSSProperties } from 'react';

/**
 * Draws an icon `scale` times its size about its centre while its stroke stays
 * 2 units: the CSS `scale` grows the drawing, and the stroke width shrinks by
 * the same factor, so only the paths change size. Works on lucide icons too.
 * The box the icon takes in the layout does not change.
 */
export function pathScale(scale: number): { style: CSSProperties; strokeWidth: number } {
  return { style: { scale: String(scale) }, strokeWidth: 2 / scale };
}
