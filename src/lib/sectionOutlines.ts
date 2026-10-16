import type { Pokemon } from '@/types/pokemon';
import { sectionName, t, type NoArgKey } from '@/i18n';
import { en } from '@/i18n/catalogs/en';
import { sectionColor } from '@/lib/sectionColors';
import { buildIdToSection } from '@/hooks/useViewSort';

export const OUTLINE_GAP = 0.24;
export const OUTLINE_PAD = 0.07;
export const OUTLINE_HEAD = 0.28;

export const OUTLINE_TITLE_OPACITY = 0.5;
export const OUTLINE_REPEAT_TITLES = false;
export const OUTLINE_TITLE_VBIAS = 0.6;
export const OUTLINE_SHORTEN_TITLES = true;
export const OUTLINE_STROKE_FRAC = 0.05;

export const outlineStrokeW = (tileSize: number, frac: number) =>
  Math.max(0.6, tileSize * frac);

function shortestAvailable(groupId: string, prefix: 'sectionShort' | 'sectionTiny'): string | null {
  const key = `${prefix}.${groupId}`;
  return key in en ? t(key as NoArgKey) : null;
}

function getSectionLabel(groupId: string): string {
  return sectionName(groupId);
}

export function getSectionLabelChain(groupId: string): string[] {
  const chain: string[] = [sectionName(groupId)];
  const push = (value: string | null) => {
    if (value && value !== chain[chain.length - 1]) chain.push(value);
  };
  push(shortestAvailable(groupId, 'sectionShort'));
  push(shortestAvailable(groupId, 'sectionTiny'));
  return chain;
}

const MIN_LABEL_SCALE = 0.72;
export const MAX_LABEL_STRETCH = 1.4;

let _measureCanvas: HTMLCanvasElement | null = null;
export function measureLabelWidth(text: string, fontPx: number): number {
  const t = text.toUpperCase();
  if (typeof document === 'undefined') return t.length * fontPx * 0.62;
  _measureCanvas ??= document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return t.length * fontPx * 0.62;
  ctx.font = `900 ${fontPx}px 'Inter Variable', system-ui, sans-serif`;
  return ctx.measureText(t).width;
}

export function fitLabel(
  alts: string[],
  availWidth: number,
  fontPx: number,
): { text: string; scaleX: number } {
  for (const text of alts) {
    const w = measureLabelWidth(text, fontPx);
    if (w <= availWidth) {
      return { text, scaleX: Math.min(MAX_LABEL_STRETCH, availWidth / w) };
    }
    const squash = availWidth / w;
    if (squash >= MIN_LABEL_SCALE) return { text, scaleX: squash };
  }
  const shortest = alts[alts.length - 1];
  const w = measureLabelWidth(shortest, fontPx);
  return { text: shortest, scaleX: availWidth / w };
}

export interface SectionRun {
  sectionId: string;
  label: string;
  labelAlts: string[];
  fillColor: string;
  strokeColor: string;
  firstRow: number;
  firstCol: number;
  lastRow: number;
  lastCol: number;
}

export function computeSectionRuns(
  sorted: Pokemon[],
  sections: Record<string, number[]>,
  cols: number,
): SectionRun[] {
  const idToSection = buildIdToSection(sections);
  const runs: SectionRun[] = [];

  let i = 0;
  while (i < sorted.length) {
    const sectionId = idToSection.get(sorted[i].id);
    if (!sectionId) { i++; continue; }

    let end = i + 1;
    while (end < sorted.length && idToSection.get(sorted[end].id) === sectionId) {
      end++;
    }

    const { fill, stroke } = sectionColor(sectionId);
    runs.push({
      sectionId,
      label: getSectionLabel(sectionId),
      labelAlts: getSectionLabelChain(sectionId),
      fillColor: fill,
      strokeColor: stroke,
      firstRow: Math.floor(i / cols),
      firstCol: i % cols,
      lastRow: Math.floor((end - 1) / cols),
      lastCol: (end - 1) % cols,
    });

    i = end;
  }

  return runs;
}

type Pt = { x: number; y: number };

function roundedPath(pts: Pt[], radius: number, concaveExtra = 0): string {
  const p: Pt[] = [];
  for (const pt of pts) {
    const last = p[p.length - 1];
    if (!last || Math.abs(last.x - pt.x) > 0.01 || Math.abs(last.y - pt.y) > 0.01) p.push(pt);
  }
  if (p.length > 1) {
    const a = p[0], b = p[p.length - 1];
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) p.pop();
  }
  const n = p.length;
  if (n < 3) return '';

  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const prev = p[(i - 1 + n) % n];
    const curr = p[i];
    const next = p[(i + 1) % n];
    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
    const v2x = next.x - curr.x, v2y = next.y - curr.y;
    const d1 = Math.hypot(v1x, v1y) || 1;
    const d2 = Math.hypot(v2x, v2y) || 1;
    const concave = v1x * v2y - v1y * v2x < 0;
    const r = Math.min(radius + (concave ? concaveExtra : 0), d1 / 2, d2 / 2);
    const t1 = { x: curr.x + (prev.x - curr.x) * (r / d1), y: curr.y + (prev.y - curr.y) * (r / d1) };
    const t2 = { x: curr.x + (next.x - curr.x) * (r / d2), y: curr.y + (next.y - curr.y) * (r / d2) };
    parts.push(`${i === 0 ? 'M' : 'L'} ${t1.x.toFixed(2)} ${t1.y.toFixed(2)}`);
    parts.push(`Q ${curr.x.toFixed(2)} ${curr.y.toFixed(2)} ${t2.x.toFixed(2)} ${t2.y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function roundRectFill(x0: number, y0: number, x1: number, y1: number, r: number, openLeft: boolean, openRight: boolean): string {
  const rTL = openLeft ? 0 : r, rBL = openLeft ? 0 : r;
  const rTR = openRight ? 0 : r, rBR = openRight ? 0 : r;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(x0 + rTL)} ${f(y0)}`,
    `L ${f(x1 - rTR)} ${f(y0)}`,
    rTR ? `Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + rTR)}` : `L ${f(x1)} ${f(y0)}`,
    `L ${f(x1)} ${f(y1 - rBR)}`,
    rBR ? `Q ${f(x1)} ${f(y1)} ${f(x1 - rBR)} ${f(y1)}` : `L ${f(x1)} ${f(y1)}`,
    `L ${f(x0 + rBL)} ${f(y1)}`,
    rBL ? `Q ${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - rBL)}` : `L ${f(x0)} ${f(y1)}`,
    `L ${f(x0)} ${f(y0 + rTL)}`,
    rTL ? `Q ${f(x0)} ${f(y0)} ${f(x0 + rTL)} ${f(y0)}` : `L ${f(x0)} ${f(y0)}`,
    'Z',
  ].join(' ');
}

function roundRectStroke(x0: number, y0: number, x1: number, y1: number, r: number, openLeft: boolean, openRight: boolean, openInset = 0): string {
  const f = (n: number) => n.toFixed(2);
  if (openRight) {
    const xe = x1 - openInset;
    return [
      `M ${f(xe)} ${f(y0)}`,
      `L ${f(x0 + r)} ${f(y0)}`,
      `Q ${f(x0)} ${f(y0)} ${f(x0)} ${f(y0 + r)}`,
      `L ${f(x0)} ${f(y1 - r)}`,
      `Q ${f(x0)} ${f(y1)} ${f(x0 + r)} ${f(y1)}`,
      `L ${f(xe)} ${f(y1)}`,
    ].join(' ');
  }
  if (openLeft) {
    const xe = x0 + openInset;
    return [
      `M ${f(xe)} ${f(y0)}`,
      `L ${f(x1 - r)} ${f(y0)}`,
      `Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}`,
      `L ${f(x1)} ${f(y1 - r)}`,
      `Q ${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}`,
      `L ${f(xe)} ${f(y1)}`,
    ].join(' ');
  }
  return roundRectFill(x0, y0, x1, y1, r, false, false);
}

export function starPath(cx: number, cy: number, r: number): string {
  const c = r * 0.12;
  const f = (n: number) => n.toFixed(2);
  return [
    `M ${f(cx)} ${f(cy - r)}`,
    `Q ${f(cx + c)} ${f(cy - c)} ${f(cx + r)} ${f(cy)}`,
    `Q ${f(cx + c)} ${f(cy + c)} ${f(cx)} ${f(cy + r)}`,
    `Q ${f(cx - c)} ${f(cy + c)} ${f(cx - r)} ${f(cy)}`,
    `Q ${f(cx - c)} ${f(cy - c)} ${f(cx)} ${f(cy - r)}`,
    'Z',
  ].join(' ');
}

export interface Spandrel {
  key: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  sectionId: string;
}

export interface OutlineShape {
  key: string;
  sectionId: string;
  fill: string;
  stroke: string;
  fillColor: string;
  strokeColor: string;
  label: string | null;
  labelAlts: string[];
  labelX: number;
  labelY: number;
  labelMaxW: number;
  open?: { side: 'left' | 'right'; x0: number; x1: number; topY: number; botY: number };
  isContinuation?: boolean;
}

export interface LastRowGeom {
  index: number;
  count: number;
  offsetCols: number;
}

export function buildOutlines(
  runs: SectionRun[],
  cols: number,
  tileSize: number,
  startRows: Set<number>,
  headroom: number,
  gap: number,
  pad: number,
  vBias: number = 0.5,
  lastRowGeom: LastRowGeom | null = null,
  strokeFrac: number = OUTLINE_STROKE_FRAC,
): { shapes: OutlineShape[]; spandrels: Spandrel[] } {
  const pitch = tileSize + gap;
  const maxRow = runs.reduce((m, r) => Math.max(m, r.lastRow), 0);
  const blockTop: number[] = new Array(maxRow + 2).fill(0);
  for (let r = 1; r <= maxRow + 1; r++) {
    blockTop[r] = blockTop[r - 1] + (startRows.has(r - 1) ? headroom : 0) + tileSize + gap;
  }
  const tileTop = (r: number) => blockTop[r] + (startRows.has(r) ? headroom : 0);

  const CIRCLE_TOP_INSET = 0.05;
  const labelCenterY = (row: number) => {
    const outlineTop = blockTop[row] - pad;
    const circleTop = tileTop(row) + tileSize * CIRCLE_TOP_INSET;
    return outlineTop + vBias * (circleTop - outlineTop);
  };

  const radius = Math.max(4, tileSize * 0.26);

  const colLeft = (c: number) => c * pitch - pad;
  const colRight = (c: number) => c * pitch + tileSize + pad;

  const LABEL_PAD = tileSize * 0.14;
  const labelLeft = (col: number) => colLeft(col) + LABEL_PAD;
  const labelAvail = (col: number, rightEdge: number) =>
    rightEdge - LABEL_PAD - labelLeft(col);

  const shapes: OutlineShape[] = [];

  const outlineGap = gap - 2 * pad;
  const strokeW = outlineStrokeW(tileSize, strokeFrac);
  const dotTail = 6 * strokeW;

  let run: SectionRun;
  const pushPoly = (suffix: string, pts: Pt[], lbl: string | null, lx: number, ly: number, lw: number) => {
    const d = roundedPath(pts, radius, outlineGap);
    shapes.push({ key: `${run.sectionId}-${suffix}`, sectionId: run.sectionId, fill: d, stroke: d, fillColor: run.fillColor, strokeColor: run.strokeColor, label: lbl, labelAlts: run.labelAlts, labelX: lx, labelY: ly, labelMaxW: lw });
  };

  const lrIdx = lastRowGeom ? lastRowGeom.index : -1;
  const lrOffset = lastRowGeom ? lastRowGeom.offsetCols * pitch : 0;
  const lrLeft = (c: number) => lrOffset + c * pitch - pad;
  const lrRight = (c: number) => lrOffset + c * pitch + tileSize + pad;
  const topLeftColOf = (r: SectionRun) => (r.firstRow === lrIdx - 1 ? r.firstCol : 0);
  const lastRowConnects = (r: SectionRun) =>
    lastRowGeom!.offsetCols + r.lastCol + 1 >= topLeftColOf(r);

  for (run of runs) {
    const { firstRow, firstCol, lastRow, lastCol, fillColor, strokeColor, label } = run;
    const xL = colLeft(0);
    const xR = colRight(cols - 1);
    const xFirstL = colLeft(firstCol);
    const xLastR = colRight(lastCol);

    const firstRowRight = firstRow === lastRow ? colRight(lastCol) : xR;
    const labelX = labelLeft(firstCol);
    const labelY = labelCenterY(firstRow);
    const labelMaxW = labelAvail(firstCol, firstRowRight);

    const yTop = blockTop[firstRow] - pad;

    if (lastRowGeom && lastRowGeom.offsetCols > 0 && run.lastRow === lrIdx) {
      const yLastTop = blockTop[lrIdx] - pad;
      const yLastBot = tileTop(lrIdx) + tileSize + pad;

      if (firstRow === lrIdx) {
        const bL = lrLeft(firstCol), bR = lrRight(lastCol);
        const lx = lrLeft(firstCol) + LABEL_PAD;
        pushPoly(`${firstRow}-${firstCol}`, [
          { x: bL, y: yLastTop }, { x: bR, y: yLastTop },
          { x: bR, y: yLastBot }, { x: bL, y: yLastBot },
        ], label, lx, labelCenterY(lrIdx), lrRight(lastCol) - LABEL_PAD - lx);
        continue;
      }

      const F = colRight(cols - 1);
      const yAboveBottom = tileTop(lrIdx - 1) + tileSize + pad;
      const jbL = lrLeft(0), jbR = lrRight(lastCol);
      const topLeftAtBottom = firstRow === lrIdx - 1 ? colLeft(firstCol) : colLeft(0);

      if (lastRowConnects(run)) {
        const pts: Pt[] = [
          { x: colLeft(firstCol), y: yTop },
          { x: F, y: yTop },
          { x: F, y: yAboveBottom },
        ];
        if (jbR < F - 0.01) pts.push({ x: jbR, y: yAboveBottom });
        pts.push({ x: jbR, y: yLastBot });
        pts.push({ x: jbL, y: yLastBot });
        if (jbL > topLeftAtBottom + 0.01) {
          pts.push({ x: jbL, y: yAboveBottom });
          pts.push({ x: topLeftAtBottom, y: yAboveBottom });
        } else {
          pts.push({ x: jbL, y: yLastTop });
          pts.push({ x: topLeftAtBottom, y: yLastTop });
        }
        if (firstRow < lrIdx - 1) {
          const yFirstBot = blockTop[firstRow + 1] - pad;
          pts.push({ x: colLeft(0), y: yFirstBot });
          pts.push({ x: colLeft(firstCol), y: yFirstBot });
        }
        pushPoly(`${firstRow}-${firstCol}`, pts, label, labelX, labelY, labelMaxW);
        continue;
      }

      shapes.push({
        key: `${run.sectionId}-${firstRow}-${firstCol}`,
        sectionId: run.sectionId,
        fill: roundRectFill(colLeft(firstCol), yTop, F, yAboveBottom, radius, false, true),
        stroke: roundRectStroke(colLeft(firstCol), yTop, F, yAboveBottom, radius, false, true, dotTail + strokeW / 2),
        fillColor, strokeColor, label, labelAlts: run.labelAlts, labelX, labelY, labelMaxW,
        open: { side: 'right', x0: colLeft(firstCol), x1: F, topY: yTop, botY: yAboveBottom },
      });
      const clx = lrLeft(0) + LABEL_PAD;
      shapes.push({
        key: `${run.sectionId}-${firstRow}-${firstCol}-last`,
        sectionId: run.sectionId,
        fill: roundRectFill(jbL, yLastTop, jbR, yLastBot, radius, true, false),
        stroke: roundRectStroke(jbL, yLastTop, jbR, yLastBot, radius, true, false, dotTail + strokeW / 2),
        fillColor, strokeColor, label, labelAlts: run.labelAlts,
        labelX: clx, labelY: labelCenterY(lrIdx), labelMaxW: lrRight(lastCol) - LABEL_PAD - clx,
        open: { side: 'left', x0: jbL, x1: jbR, topY: yLastTop, botY: yLastBot },
        isContinuation: true,
      });
      continue;
    }

    if (firstRow === lastRow) {
      const yBottom = tileTop(firstRow) + tileSize + pad;
      pushPoly(`${firstRow}-${firstCol}`, [
        { x: xFirstL, y: yTop },
        { x: xLastR, y: yTop },
        { x: xLastR, y: yBottom },
        { x: xFirstL, y: yBottom },
      ], label, labelX, labelY, labelMaxW);
      continue;
    }

    if (lastRow - firstRow === 1 && firstCol > lastCol + 1) {
      const yBotA = tileTop(firstRow) + tileSize + pad;
      shapes.push({
        key: `${run.sectionId}-${firstRow}-${firstCol}-a`,
        sectionId: run.sectionId,
        fill: roundRectFill(xFirstL, yTop, xR, yBotA, radius, false, true),
        stroke: roundRectStroke(xFirstL, yTop, xR, yBotA, radius, false, true, dotTail + strokeW / 2),
        fillColor, strokeColor, label, labelAlts: run.labelAlts, labelX, labelY, labelMaxW,
        open: { side: 'right', x0: xFirstL, x1: xR, topY: yTop, botY: yBotA },
      });
      const yTopB = blockTop[lastRow] - pad;
      const yBotB = tileTop(lastRow) + tileSize + pad;
      const labelBX = labelLeft(0);
      const labelBY = labelCenterY(lastRow);
      const labelBW = labelAvail(0, xLastR);
      shapes.push({
        key: `${run.sectionId}-${firstRow}-${firstCol}-b`,
        sectionId: run.sectionId,
        fill: roundRectFill(xL, yTopB, xLastR, yBotB, radius, true, false),
        stroke: roundRectStroke(xL, yTopB, xLastR, yBotB, radius, true, false, dotTail + strokeW / 2),
        fillColor, strokeColor, label, labelAlts: run.labelAlts, labelX: labelBX, labelY: labelBY, labelMaxW: labelBW,
        open: { side: 'left', x0: xL, x1: xLastR, topY: yTopB, botY: yBotB },
        isContinuation: true,
      });
      continue;
    }

    const yLeftStep = blockTop[firstRow + 1] - pad;
    const yRightStep = tileTop(lastRow - 1) + tileSize + pad;
    const yBottom = tileTop(lastRow) + tileSize + pad;
    pushPoly(`${firstRow}-${firstCol}`, [
      { x: xFirstL, y: yTop },
      { x: xR, y: yTop },
      { x: xR, y: yRightStep },
      { x: xLastR, y: yRightStep },
      { x: xLastR, y: yBottom },
      { x: xL, y: yBottom },
      { x: xL, y: yLeftStep },
      { x: xFirstL, y: yLeftStep },
    ], label, labelX, labelY, labelMaxW);
  }

  const spandrels: Spandrel[] = [];
  const posSec = new Map<number, string>();
  const secStroke = new Map<string, string>();
  for (const r of runs) {
    secStroke.set(r.sectionId, r.strokeColor);
    const start = r.firstRow * cols + r.firstCol;
    const end = r.lastRow * cols + r.lastCol;
    for (let p = start; p <= end; p++) posSec.set(p, r.sectionId);
  }
  const secAt = (row: number, col: number) => posSec.get(row * cols + col);
  for (let n = 0; n < maxRow; n++) {
    const below = n + 1;
    if (!startRows.has(below)) continue;
    if (lastRowGeom && below === lastRowGeom.index) continue;
    for (let c = 0; c < cols - 1; c++) {
      const s = secAt(n, c);
      if (!s || secAt(n, c + 1) !== s || secAt(below, c) !== s || secAt(below, c + 1) !== s) continue;
      const cx = c * pitch + tileSize + gap / 2 - tileSize * 0.03;
      const cy = (tileTop(n) + tileSize + tileTop(below)) / 2 - tileSize * 0.03;
      spandrels.push({
        key: `sp-${n}-${c}`, cx, cy, r: tileSize * 0.16,
        color: secStroke.get(s) ?? '#555555', sectionId: s,
      });
    }
  }

  return { shapes, spandrels };
}

export function computeOutlineLayout(
  sorted: Pokemon[],
  sections: Record<string, number[]>,
  totalSlots: number,
  cols: number,
) {
  const lastRowCount = totalSlots % cols || cols;
  const gridSlots = totalSlots - lastRowCount;
  const totalRows = Math.ceil(totalSlots / cols);
  const lastRowIndex = totalRows - 1;
  const lastRowOffsetCols = (cols - lastRowCount) / 2;
  const lastRowGeom: LastRowGeom | null =
    lastRowOffsetCols > 0
      ? { index: lastRowIndex, count: lastRowCount, offsetCols: lastRowOffsetCols }
      : null;
  const allRuns = computeSectionRuns(sorted, sections, cols);

  const lastConnects = (r: SectionRun) => {
    const topLeftCol = r.firstRow === lastRowIndex - 1 ? r.firstCol : 0;
    return lastRowOffsetCols + r.lastCol + 1 >= topLeftCol;
  };
  const bandRows = new Set<number>();
  for (const r of allRuns) {
    bandRows.add(r.firstRow);
    if (!OUTLINE_REPEAT_TITLES) continue;
    if (r.lastRow !== lastRowIndex) {
      if (r.lastRow - r.firstRow === 1 && r.firstCol > r.lastCol + 1) bandRows.add(r.lastRow);
    } else if (lastRowGeom && r.firstRow < lastRowIndex && !lastConnects(r)) {
      bandRows.add(lastRowIndex);
    }
  }
  const gridStartRows = new Set([...bandRows].filter((r) => r < lastRowIndex));
  const lastRowStartRows = new Set([...bandRows].filter((r) => r === lastRowIndex));
  const numStartRows = bandRows.size;
  const colFactor = cols + (cols - 1) * OUTLINE_GAP + 2 * OUTLINE_PAD;
  const rowFactor =
    totalRows + Math.max(totalRows - 1, 0) * OUTLINE_GAP + numStartRows * OUTLINE_HEAD + 2 * OUTLINE_PAD;

  return {
    lastRowCount, gridSlots, allRuns, lastRowGeom,
    gridStartRows, lastRowStartRows, bandRows,
    colFactor, rowFactor, totalRows, lastRowIndex,
  };
}
