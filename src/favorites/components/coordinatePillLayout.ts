/** Fixed proportional sizing; origin count changes rows, never glyph size. */
export function coordinatePillLayout(spritePx: number, inset: number, markPx: number) {
  const gap = Math.max(1, Math.round(spritePx * 0.02));
  const available = Math.max(1, spritePx - inset * 2);
  // Very narrow screens keep readable halves in a single column.
  const columns = available >= 40 + gap ? 2 : 1;
  const size = Math.min((available - (columns - 1) * gap) / (columns * 2), Math.max(10, markPx * 0.75));
  return { size, gap, columns, width: size * columns * 2 + (columns - 1) * gap };
}

