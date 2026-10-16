import type { CSSProperties } from 'react';

export function pathScale(scale: number): { style: CSSProperties; strokeWidth: number } {
  return { style: { scale: String(scale) }, strokeWidth: 2 / scale };
}
