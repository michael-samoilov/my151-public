import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TYPE_ICONS } from '../src/data/type-icons';

type Matrix = [number, number, number, number, number, number];
type Segment = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const FRAME = 44;
const UNITS = 100;
const KAPPA = (4 / 3) * (Math.SQRT2 - 1);

function multiply([a, b, c, d, e, f]: Matrix, [g, h, i, j, k, l]: Matrix): Matrix {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

function parseTransform(value: string | undefined, where: string): Matrix {
  let m = IDENTITY;
  if (!value) return m;
  for (const [, name, args] of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (n.some(Number.isNaN)) throw new Error(`${where}: bad transform ${value}`);
    let next: Matrix;
    if (name === 'matrix' && n.length === 6) next = n as Matrix;
    else if (name === 'translate' && n.length <= 2) next = [1, 0, 0, 1, n[0], n[1] ?? 0];
    else if (name === 'scale' && n.length <= 2) next = [n[0], 0, 0, n[1] ?? n[0], 0, 0];
    else throw new Error(`${where}: unsupported transform ${name}(${args})`);
    m = multiply(m, next);
  }
  return m;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function absoluteSegments(d: string, where: string): Segment[] {
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g)];
  const out: Segment[] = [];
  let i = 0;
  let command = '';
  let x = 0, y = 0, startX = 0, startY = 0;
  let cubicCtrl: [number, number] | null = null;
  let quadCtrl: [number, number] | null = null;
  const num = () => {
    const token = tokens[i++];
    if (!token?.[2]) throw new Error(`${where}: path data ends early`);
    return Number(token[2]);
  };
  while (i < tokens.length) {
    if (tokens[i][1]) command = tokens[i++][1];
    else if (!command) throw new Error(`${where}: path data starts with a number`);
    const rel = command === command.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const upper = command.toUpperCase();
    let nextCubic: [number, number] | null = null;
    let nextQuad: [number, number] | null = null;
    if (upper === 'M') {
      x = ox + num(); y = oy + num();
      startX = x; startY = y;
      out.push(['M', x, y]);
      // platform: SVG path data reads further coordinate pairs after a move as lines.
      command = rel ? 'l' : 'L';
    } else if (upper === 'L') {
      x = ox + num(); y = oy + num();
      out.push(['L', x, y]);
    } else if (upper === 'H') {
      x = ox + num();
      out.push(['L', x, y]);
    } else if (upper === 'V') {
      y = oy + num();
      out.push(['L', x, y]);
    } else if (upper === 'C' || upper === 'S') {
      let x1: number, y1: number;
      if (upper === 'C') { x1 = ox + num(); y1 = oy + num(); }
      else [x1, y1] = cubicCtrl ? [2 * x - cubicCtrl[0], 2 * y - cubicCtrl[1]] : [x, y];
      const x2 = ox + num(), y2 = oy + num();
      const ex = ox + num(), ey = oy + num();
      out.push(['C', x1, y1, x2, y2, ex, ey]);
      nextCubic = [x2, y2];
      x = ex; y = ey;
    } else if (upper === 'Q' || upper === 'T') {
      let qx: number, qy: number;
      if (upper === 'Q') { qx = ox + num(); qy = oy + num(); }
      else [qx, qy] = quadCtrl ? [2 * x - quadCtrl[0], 2 * y - quadCtrl[1]] : [x, y];
      const ex = ox + num(), ey = oy + num();

      out.push(['C', x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey]);
      nextQuad = [qx, qy];
      x = ex; y = ey;
    } else if (upper === 'Z') {
      out.push(['Z']);
      x = startX; y = startY;
    } else {
      throw new Error(`${where}: unsupported path command ${command}`);
    }
    cubicCtrl = nextCubic;
    quadCtrl = nextQuad;
  }
  return out;
}

function circleSegments(cx: number, cy: number, r: number): Segment[] {
  const k = KAPPA * r;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

function glyphShapes(svg: string, where: string): Segment[][] {
  const viewBox = attr(svg.slice(0, svg.indexOf('>') + 1), 'viewBox');
  if (viewBox !== `0 0 ${FRAME} ${FRAME}`) throw new Error(`${where}: viewBox is ${viewBox}, not the shared ${FRAME}-unit frame`);
  const stack: Matrix[] = [IDENTITY];
  const shapes: Segment[][] = [];
  for (const [, closing, name, rest, selfClosing] of svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const tag = ` ${rest}`;
    if (name === 'svg') continue;
    if (name === 'g') {
      if (closing) stack.pop();
      else if (!selfClosing) stack.push(multiply(stack.at(-1)!, parseTransform(attr(tag, 'transform'), where)));
      continue;
    }
    if (closing) continue;
    if (name !== 'path' && name !== 'circle') throw new Error(`${where}: unsupported <${name}>`);
    if (!/^(#fff|#ffffff|white)$/i.test(attr(tag, 'fill') ?? '')) throw new Error(`${where}: a <${name}> is not filled white`);
    const rule = attr(tag, 'fill-rule');
    if (rule && rule !== 'nonzero') throw new Error(`${where}: fill-rule ${rule}`);
    const m = multiply(stack.at(-1)!, parseTransform(attr(tag, 'transform'), where));
    const segments = name === 'path'
      ? absoluteSegments(attr(tag, 'd') ?? '', where)
      : circleSegments(Number(attr(tag, 'cx')), Number(attr(tag, 'cy')), Number(attr(tag, 'r')));
    shapes.push(segments.map((s): Segment => {
      if (s[0] === 'Z') return s;
      const p = s.slice(1) as number[];
      const mapped = p.map((_, k) => (k % 2 === 0 ? m[0] * p[k] + m[2] * p[k + 1] + m[4] : m[1] * p[k - 1] + m[3] * p[k] + m[5]));
      return [s[0], ...mapped] as Segment;
    }));
  }
  if (shapes.length === 0) throw new Error(`${where}: no shapes`);
  return shapes;
}

const tenths = (v: number) => Math.round(((v - FRAME / 2) * UNITS) / FRAME * 10);

function format(n: number): string {
  return (n / 10).toString().replace(/^(-?)0\./, '$1.');
}

function relativePath(segments: Segment[]): string {
  let out = '';
  let last = '';
  let x = 0, y = 0, startX = 0, startY = 0;
  const emit = (letter: string, values: number[]) => {
    // platform: SVG path data repeats a line or curve letter implicitly, but pairs after a move are lines.
    const lettered = letter !== last || letter === 'm' || letter === 'z';
    if (lettered) out += letter;
    values.forEach((v, k) => {
      const s = format(v);
      out += (k === 0 && lettered) || s.startsWith('-') ? s : ` ${s}`;
    });
    last = letter;
  };
  for (const s of segments) {
    if (s[0] === 'Z') {
      emit('z', []);
      x = startX; y = startY;
      continue;
    }
    const p = s.slice(1).map((v) => tenths(v as number));
    const d = p.map((v, k) => v - (k % 2 === 0 ? x : y));
    x = p.at(-2)!; y = p.at(-1)!;
    if (s[0] === 'M') { startX = x; startY = y; }
    emit(s[0].toLowerCase(), d);
  }
  return out;
}

export function typeGlyphPaths(): Record<string, string[]> {
  return Object.fromEntries(Object.entries(TYPE_ICONS).map(([type, { glyph }]) => {
    const svg = readFileSync(resolve('public', `.${glyph}`), 'utf8');
    return [type, glyphShapes(svg, glyph).map(relativePath)];
  }));
}

const outputPath = resolve('src/data/typeGlyphPaths.json');

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeFileSync(outputPath, `${JSON.stringify(typeGlyphPaths(), null, 1)}\n`);
}
