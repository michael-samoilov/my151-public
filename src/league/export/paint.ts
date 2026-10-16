/**
 * Canvas primitives and the card's glyphs.
 *
 * Everything the export draws is drawn here, natively. The dex export learned
 * this the hard way: rasterizing the DOM needs an SVG `<foreignObject>`, which
 * hangs the export on iOS WebKit, so a picture of the app is redrawn rather
 * than screenshotted. The shapes below are the same path data the components
 * use, so the PNG and the screen cannot drift apart.
 */

export const FONT_STACK = '"Inter Variable", system-ui, -apple-system, sans-serif';

export function font(px: number, weight: number): string {
  return `${weight} ${px}px ${FONT_STACK}`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Width of a tracked run.
 *
 * Tracking is applied by hand rather than through `ctx.letterSpacing`, which
 * lands in Safari only from 17.4 — a silent no-op on older iPhones would make
 * every label narrower in the PNG than the layout allowed for. CSS adds the
 * space after the last character too, so this does the same.
 */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  if (track === 0) return ctx.measureText(text).width;
  return ctx.measureText(text).width + track * [...text].length;
}

/**
 * Draw a tracked run from `x`, honouring the current `textBaseline`.
 *
 * Each character is placed at the measured width of the run *before* it, not
 * at a running total of single-character widths. Summing characters throws
 * away kerning and rounds once per glyph, which walked the end of a tracked
 * word about two pixels off the line the browser draws.
 */
export function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  track: number,
): void {
  if (track === 0) {
    ctx.fillText(text, x, y);
    return;
  }
  const chars = [...text];
  let prefix = '';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x + ctx.measureText(prefix).width + track * i, y);
    prefix += chars[i];
  }
}

export function fillTrackedCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  track: number,
): void {
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  fillTracked(ctx, text, cx - trackedWidth(ctx, text, track) / 2, y, track);
  ctx.textAlign = prev;
}

export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  px: number,
  floor: number,
  weight: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const prev = ctx.font;
  let size = px;
  while (size > floor) {
    ctx.font = font(size, weight);
    const widest = Math.max(0, ...words.map((w) => ctx.measureText(w).width));
    if (widest <= maxW) break;
    size -= 0.5;
  }
  ctx.font = prev;
  return Math.max(size, floor);
}

export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const next = out + chars[i];
    if (ctx.measureText(next + '…').width > maxW) break;
    out = next;
  }
  return out.trimEnd() + '…';
}

export function ellipsizeTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  track: number,
): string {
  if (trackedWidth(ctx, text, track) <= maxW) return text;
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const next = out + chars[i];
    if (trackedWidth(ctx, `${next}…`, track) > maxW) break;
    out = next;
  }
  return out.trimEnd() + '…';
}

export function wrapTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  track: number,
): string[] {
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const joined = lines.length ? `${lines[lines.length - 1]} ${word}` : '';
    if (joined && trackedWidth(ctx, joined, track) <= maxW) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  return lines;
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
  ellipsizeLast = true,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === 0) return [];
  const last = lines.length - 1;
  const spilled = lines.length === maxLines && words.join(' ') !== lines.join(' ');
  if (ellipsizeLast && (spilled || ctx.measureText(lines[last]).width > maxW)) {
    lines[last] = ellipsize(ctx, lines[last], maxW);
  }
  return lines;
}

function inBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  viewBox: number,
  draw: () => void,
  rotateDeg = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / viewBox, size / viewBox);
  if (rotateDeg !== 0) {
    ctx.translate(viewBox / 2, viewBox / 2);
    ctx.rotate((rotateDeg * Math.PI) / 180);
    ctx.translate(-viewBox / 2, -viewBox / 2);
  }
  draw();
  ctx.restore();
}

/**
 * The glyph outlines, built on first use.
 *
 * `Path2D` exists only in a browser, and this module is imported by the unit
 * tests through the layout it shares with them. Building at import time made
 * `import` itself throw under Node.
 */
const PATHS: Record<string, string> = {
  diamondFilled: 'M6 0 L12 6 L6 12 L0 6 Z',
  diamondOpen: 'M6 1 L11 6 L6 11 L1 6 Z',
  star: 'M6 0.5 L7.5 4.4 L11.6 4.4 L8.3 6.9 L9.6 10.9 L6 8.5 L2.4 10.9 L3.7 6.9 L0.4 4.4 L4.5 4.4 Z',
  crown: 'M2 12.5 L1 3.6 L5.2 7.2 L8 2.2 L10.8 7.2 L15 3.6 L14 12.5 Z',
  hexagon: 'M16 3 L27 9.5 L27 22.5 L16 29 L5 22.5 L5 9.5 Z',
  ballTop: 'M20 2 C10.06 2 2 10.06 2 20 L15 20 A5 5 0 0 1 25 20 L38 20 C38 10.06 29.94 2 20 2 Z',
  ballBottom: 'M15 20 A5 5 0 0 0 25 20 L38 20 C38 29.94 29.94 38 20 38 C10.06 38 2 29.94 2 20 L15 20 Z',
};

const built = new Map<string, Path2D>();

function path(name: keyof typeof PATHS & string): Path2D {
  let p = built.get(name);
  if (!p) {
    p = new Path2D(PATHS[name]);
    built.set(name, p);
  }
  return p;
}

export function drawDiamonds(
  ctx: CanvasRenderingContext2D,
  n: number,
  size: number,
  cx: number,
  cy: number,
  gap: number,
): void {
  const perLine = n <= 4 ? n : 4;
  const rows = Math.ceil(n / perLine);
  const blockW = perLine * size + (perLine - 1) * gap;
  const blockH = rows * size + (rows - 1) * gap;
  const left = cx - blockW / 2;
  const top = cy - blockH / 2;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perLine);
    const c = i % perLine;
    const x = left + c * (size + gap);
    const y = top + r * (size + gap);
    inBox(ctx, x, y, size, 12, () => {
      if (i < n - 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fill(path('diamondFilled'));
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke(path('diamondOpen'));
      }
    });
  }
}

export function drawStars(
  ctx: CanvasRenderingContext2D,
  n: number,
  size: number,
  cx: number,
  cy: number,
  gap: number,
): void {
  const blockW = n * size + (n - 1) * gap;
  const left = cx - blockW / 2;
  const top = cy - size / 2;
  for (let i = 0; i < n; i++) {
    inBox(ctx, left + i * (size + gap), top, size, 12, () => {
      ctx.fillStyle = '#ffffff';
      ctx.fill(path('star'));
    });
  }
}

export function drawCrown(ctx: CanvasRenderingContext2D, size: number, cx: number, cy: number): void {
  inBox(ctx, cx - size / 2, cy - size / 2, size, 16, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fill(path('crown'));
    roundRect(ctx, 2, 13, 12, 1.6, 0.8);
    ctx.fill();
  });
}

export function drawBossBall(
  ctx: CanvasRenderingContext2D,
  cell: string,
  size: number,
  cx: number,
  cy: number,
): void {
  inBox(ctx, cx - size / 2, cy - size / 2, size, 24, () => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(12, 12, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cell;
    ctx.fillRect(0, 10.7, 24, 2.6);
    ctx.beginPath();
    ctx.arc(12, 12, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(12, 12, 2.7, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawEmptyBall(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
): void {
  inBox(
    ctx,
    cx - size / 2,
    cy - size / 2,
    size,
    24,
    () => {
      const c = 'rgba(10,10,10,0.14)';
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(12, 12, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1, 12);
      ctx.lineTo(8.5, 12);
      ctx.moveTo(15.5, 12);
      ctx.lineTo(23, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 12, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(12, 12, 1.5, 0, Math.PI * 2);
      ctx.fill();
    },
    -30,
  );
}

export function drawTmDisc(
  ctx: CanvasRenderingContext2D,
  colour: string,
  size: number,
  x: number,
  y: number,
): void {
  inBox(ctx, x, y, size, 24, () => {
    ctx.translate(12, 12);
    ctx.transform(1, 0, Math.tan((-16 * Math.PI) / 180), 1, 0, 0);
    ctx.translate(-12, -12);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, 12, 3.2, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function drawHexagon(
  ctx: CanvasRenderingContext2D,
  colour: string,
  filled: boolean,
  size: number,
  x: number,
  y: number,
): void {
  inBox(ctx, x, y, size, 32, () => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = filled ? 2.4 : 8 / 3;
    ctx.stroke(path('hexagon'));
    ctx.beginPath();
    ctx.arc(16, 16, 4.4, 0, Math.PI * 2);
    ctx.stroke();
  });
}

export function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const c = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + c, cy - c, cx + r, cy);
  ctx.quadraticCurveTo(cx + c, cy + c, cx, cy + r);
  ctx.quadraticCurveTo(cx - c, cy + c, cx - r, cy);
  ctx.quadraticCurveTo(cx - c, cy - c, cx, cy - r);
  ctx.closePath();
  ctx.fill();
}

export function drawPokeballBg(
  ctx: CanvasRenderingContext2D,
  primary: string,
  secondary: string,
  size: number,
  cx: number,
  cy: number,
): void {
  inBox(
    ctx,
    cx - size / 2,
    cy - size / 2,
    size,
    40,
    () => {
      ctx.globalAlpha = 0.33;
      ctx.fillStyle = primary;
      ctx.fill(path('ballTop'));
      ctx.fillStyle = secondary;
      ctx.fill(path('ballBottom'));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke(path('ballTop'));
      ctx.stroke(path('ballBottom'));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(20, 20, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    },
    -30,
  );
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
): void {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.imageSmoothingEnabled = was;
}
