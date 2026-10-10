/** Shared symbol ink, independent of the platform's Unicode fallback font. */
export const GENDER_SYMBOL_HEIGHT_EM = 0.73;

const SYMBOLS = {
  '♂': { width: 20, path: 'M12.55 13.1a5.65 5.65 0 1 1-11.3 0a5.65 5.65 0 1 1 11.3 0M10.9 9.1l7.85-7.85M12.8 1.25h5.95V7.2' },
  '♀': { width: 16, path: 'M12.85 6.1a4.85 4.85 0 1 1-9.7 0a4.85 4.85 0 1 1 9.7 0M8 10.95v7.8M4.8 15.8h6.4' },
} as const;

export function genderSymbol(mark: string) {
  return mark === '♂' || mark === '♀' ? SYMBOLS[mark] : undefined;
}

export function genderSymbolWidth(mark: string, markerFontSize: number): number {
  const symbol = genderSymbol(mark);
  return symbol ? markerFontSize * GENDER_SYMBOL_HEIGHT_EM * symbol.width / 20 : 0;
}

/** The symbol's bottom shares the text baseline, like a regional capital. */
export function drawGenderSymbol(
  ctx: CanvasRenderingContext2D, mark: string, x: number, baseline: number, markerFontSize: number,
): void {
  const symbol = genderSymbol(mark);
  if (!symbol) return;
  const height = markerFontSize * GENDER_SYMBOL_HEIGHT_EM;
  ctx.save();
  ctx.translate(x, baseline - height);
  ctx.scale(height / 20, height / 20);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(symbol.path));
  ctx.restore();
}
