// Section-outline geometry, shared by the live View page (SVG render) and the
// PNG export (canvas render). Everything here is pure — no React, no DOM beyond
// an offscreen canvas for text measurement — so it can run in either context.
import type { Pokemon, TypeName } from '@/types/pokemon';
import { sectionName, t, type NoArgKey } from '@/i18n';
import { en } from '@/i18n/catalogs/en';
import { sectionColor } from '@/lib/sectionColors';
import { buildIdToSection } from '@/hooks/useViewSort';
import { SECTION_TYPE } from '@/data/section-types';

export const COLS = 10;

// Outline-mode spacing, as multiples of tileSize. In outline mode the grid gains
// a single uniform gap (OUTLINE_GAP) between every cell in both directions, and
// each section outline is drawn a fixed inset (OUTLINE_PAD) outside its tiles on
// all sides — so the gap between any two neighbouring outlines is uniformly
// OUTLINE_GAP - 2*OUTLINE_PAD, top/bottom and left/right alike. OUTLINE_HEAD is
// the label band reserved above each section's first row.
export const OUTLINE_GAP = 0.24;
export const OUTLINE_PAD = 0.07;
export const OUTLINE_HEAD = 0.28;

// Finalized title/outline values (previously live debug knobs). Locked in for
// production; kept as named constants so the View page and the export agree.
export const OUTLINE_TITLE_OPACITY = 0.5;
export const OUTLINE_REPEAT_TITLES = false;
export const OUTLINE_TITLE_VBIAS = 0.6;
export const OUTLINE_SHORTEN_TITLES = true;
export const OUTLINE_STROKE_FRAC = 0.05;

// Outline border stroke width. It scales WITH the tile size (≈5% of it) so the
// border-to-gap ratio stays constant across screen sizes — a fixed px width looks
// fine on a wide screen but far too thick on a phone (small tiles ⇒ small gaps).
// Clamped to a hairline minimum so it never vanishes. The open side of a ≤9 wrap
// ends in a dotted tail: three dots of diameter = stroke width, separated by
// equal (dot-width) spaces; the outermost dot's edge sits on the old border line
// and the solid stroke resumes one space past the innermost dot, so the tail is
// 3 dots + 3 spaces = 6× the stroke width, and the fill fades across that span.
export const outlineStrokeW = (tileSize: number, frac: number) =>
  Math.max(0.6, tileSize * frac);

// --- Section names -------------------------------------------------------

/**
 * Section labels shorten in two rungs as the outline narrows: the full name,
 * then a short form, then a tiny one. These used to be English abbreviation
 * tables in code; they are catalog keys now because "the short form of
 * Pikaclone" is an editorial judgement each language has to make for itself —
 * there is no mechanical way to abbreviate 阿羅拉.
 *
 * A locale that supplies no short form simply falls back to the full name and
 * lets fitLabel's horizontal squash do the work, which is a reasonable
 * outcome rather than a broken one.
 */
function shortestAvailable(groupId: string, prefix: 'sectionShort' | 'sectionTiny'): string | null {
  const key = `${prefix}.${groupId}`;
  return key in en ? t(key as NoArgKey) : null;
}

export function getSectionLabel(groupId: string): string {
  return shortestAvailable(groupId, 'sectionShort') ?? sectionName(groupId);
}

/** Progressive label fallbacks, longest → shortest. */
export function getSectionLabelChain(groupId: string): string[] {
  const chain = [getSectionLabel(groupId)];
  const tiny = shortestAvailable(groupId, 'sectionTiny');
  if (tiny && tiny !== chain[0]) chain.push(tiny);
  return chain;
}

// --- Label fitting -------------------------------------------------------
// A section name is drawn at a base font size, but its outline may be as narrow
// as a single tile (or much wider). To keep names whole we, per candidate name:
//   • squash horizontally (scaleX < 1) down to MIN_LABEL_SCALE if too wide, else
//   • stretch (scaleX > 1) up to MAX_LABEL_STRETCH, capped at the section width.
// If a name still overflows when squashed to the floor, the next shorter name in
// the chain is tried. If even the shortest name doesn't fit at the floor, it is
// squashed the rest of the way to fit the available space exactly (below the
// floor) — names are never truncated or wrapped.
const MIN_LABEL_SCALE = 0.72;
export const MAX_LABEL_STRETCH = 1.4;

let _measureCanvas: HTMLCanvasElement | null = null;
export function measureLabelWidth(text: string, fontPx: number): number {
  // Labels render uppercase (CSS), and caps are wider than the title-case source
  // strings — so measure the uppercased form or the fit will be under-estimated.
  const t = text.toUpperCase();
  if (typeof document === 'undefined') return t.length * fontPx * 0.62;
  _measureCanvas ??= document.createElement('canvas');
  const ctx = _measureCanvas.getContext('2d');
  if (!ctx) return t.length * fontPx * 0.62;
  ctx.font = `900 ${fontPx}px 'Inter Variable', system-ui, sans-serif`;
  return ctx.measureText(t).width;
}

/** Pick the longest chain name that fits `availWidth` at `fontPx`. A fitting
 *  name stretches up to MAX_LABEL_STRETCH (bounded by the width); an over-wide
 *  name squashes down to MIN_LABEL_SCALE before the next shorter name is tried.
 *  If nothing fits at the floor, the shortest name is squashed to fit exactly. */
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
  // Nothing fits even squashed to the floor: squash the shortest name the rest
  // of the way so it fits the available space exactly (no wrap, no truncation).
  const shortest = alts[alts.length - 1];
  const w = measureLabelWidth(shortest, fontPx);
  return { text: shortest, scaleX: availWidth / w };
}

// --- Section runs --------------------------------------------------------

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

/** Break the sorted list into contiguous reading-order runs of a single
 *  section. Each run becomes exactly one outline (and one label). */
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

// --- Path builders -------------------------------------------------------

type Pt = { x: number; y: number };

/** Build an SVG path that traces an ordered (clockwise) rectilinear polygon with
 *  rounded corners. Convex corners use `radius`; concave corners use
 *  `radius + concaveExtra`. Passing concaveExtra = the inter-outline gap makes a
 *  concave "big spoon" corner share a centre with the convex "little spoon"
 *  corner that nests inside it, so the gap stays uniform around the bend. */
function roundedPath(pts: Pt[], radius: number, concaveExtra = 0): string {
  // Drop consecutive coincident points (collapsed edges from flush columns).
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
    // Cross product < 0 is a left turn = concave corner on a clockwise polygon.
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

/** Closed rounded-rect path. The open side (left or right) gets square corners
 *  so the fill reads as continuing off that edge. */
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

/** Open stroke for a rounded rect: the open side is left undrawn so the border
 *  continues off that edge. `openInset` pulls the top/bottom borders back from
 *  the open edge by that much, leaving room for the trailing dots. */
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

/** Curved 4-pointed star (plus-oriented: points up / right / down / left), used
 *  as a spandrel marker in the corner gap between contiguous same-section cells.
 *  The control points pull toward the centre so the sides curve concavely. */
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
  /** The section's representative type → type-symbol icon, or null → 4-point star. */
  type: TypeName | null;
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
  // Set on the open side of a ≤9-pokemon wrap piece: the fill fades out toward
  // the open edge and the top/bottom borders trail off into three dots.
  open?: { side: 'left' | 'right'; x0: number; x1: number; topY: number; botY: number };
  // True on the *continuation* piece of a single wrapped run (the re-shown half
  // of a ≤9 open wrap). Its title is the only one suppressed in "show once" mode
  // — separate runs of a section each keep their own title.
  isContinuation?: boolean;
}

export interface LastRowGeom {
  index: number;
  count: number;
  offsetCols: number;
}

/** Turn section runs into outline shapes. A run that wraps across rows and
 *  stays column-contiguous becomes a single enclosing outline; the rare wrap
 *  with no column overlap falls back to two rectangles. Every border — sides,
 *  top/bottom, ribbon steps and the label band — sits a uniform `pad` outside
 *  the section's own tiles, so any two neighbouring outlines are separated by
 *  exactly `gap - 2*pad` in every direction. */
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
  // Cumulative top of each row block. A block = optional label band + tile, and
  // rows are separated by `gap`. Tiles bottom-align, so a start row's tile sits
  // below its band.
  const blockTop: number[] = new Array(maxRow + 2).fill(0);
  for (let r = 1; r <= maxRow + 1; r++) {
    blockTop[r] = blockTop[r - 1] + (startRows.has(r - 1) ? headroom : 0) + tileSize + gap;
  }
  const tileTop = (r: number) => blockTop[r] + (startRows.has(r) ? headroom : 0);

  // Vertical line the section name is centred on (translateY(-50%) in render).
  // It sits between the outline's top edge (vBias 0) and the top of that row's
  // pokeball circles (vBias 1).
  const CIRCLE_TOP_INSET = 0.05;
  const labelCenterY = (row: number) => {
    const outlineTop = blockTop[row] - pad;
    const circleTop = tileTop(row) + tileSize * CIRCLE_TOP_INSET;
    return outlineTop + vBias * (circleTop - outlineTop);
  };

  const radius = Math.max(4, tileSize * 0.26);

  // A border for column c sits `pad` outside the tile, into the surrounding gap.
  const colLeft = (c: number) => c * pitch - pad;
  const colRight = (c: number) => c * pitch + tileSize + pad;

  // Title horizontal padding — equal on both sides: the gap from the outline's
  // left edge to the start of the text matches the gap from the end of the
  // available text space to the outline's right edge.
  const LABEL_PAD = tileSize * 0.14;
  const labelLeft = (col: number) => colLeft(col) + LABEL_PAD;
  const labelAvail = (col: number, rightEdge: number) =>
    rightEdge - LABEL_PAD - labelLeft(col);

  const shapes: OutlineShape[] = [];

  // Uniform gap between neighbouring outlines — concave corners are widened by
  // this so a convex corner nesting inside keeps the gap constant round the bend.
  const outlineGap = gap - 2 * pad;
  const strokeW = outlineStrokeW(tileSize, strokeFrac);
  const dotTail = 6 * strokeW;

  let run: SectionRun;
  const pushPoly = (suffix: string, pts: Pt[], lbl: string | null, lx: number, ly: number, lw: number) => {
    const d = roundedPath(pts, radius, outlineGap);
    shapes.push({ key: `${run.sectionId}-${suffix}`, sectionId: run.sectionId, fill: d, stroke: d, fillColor: run.fillColor, strokeColor: run.strokeColor, label: lbl, labelAlts: run.labelAlts, labelX: lx, labelY: ly, labelMaxW: lw });
  };

  // --- Centered last (overflow) row ---------------------------------------
  // Rows past the 151st are center-aligned, so their cells sit at fractional
  // column offsets and don't line up with the regular grid columns. These
  // helpers give the last row's tile/outline x in pixels, and decide — by actual
  // x-overlap rather than integer-column adjacency — whether a section's cells in
  // that row connect to its cells in the row above.
  const lrIdx = lastRowGeom ? lastRowGeom.index : -1;
  const lrOffset = lastRowGeom ? lastRowGeom.offsetCols * pitch : 0;
  const lrLeft = (c: number) => lrOffset + c * pitch - pad;
  const lrRight = (c: number) => lrOffset + c * pitch + tileSize + pad;
  // The run occupies [topLeftCol .. cols-1] on the row directly above the last
  // row (its own firstCol if that row is firstRow, else the full row).
  const topLeftColOf = (r: SectionRun) => (r.firstRow === lrIdx - 1 ? r.firstCol : 0);
  // Connect when the centered bottom's right edge reaches the top-left column —
  // `>` is an x-overlap, `===` is a diagonal corner touch (only possible when the
  // count is even, so the offset is integral). Both join; a real gap (`<`) stays
  // split. The diagonal case relies on spoon rounding, like the exactly-10 wrap.
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

    // The top border sits `pad` above the label band (the band is part of the
    // section's content box, so its top counts as the section's top edge).
    const yTop = blockTop[firstRow] - pad;

    // Runs reaching the centered overflow row: the bottom cells sit at a
    // fractional offset, so connect/separate by actual x-overlap, not columns.
    if (lastRowGeom && lastRowGeom.offsetCols > 0 && run.lastRow === lrIdx) {
      const yLastTop = blockTop[lrIdx] - pad;
      const yLastBot = tileTop(lrIdx) + tileSize + pad;

      // Section that lives entirely within the centered row → one offset rect.
      if (firstRow === lrIdx) {
        const bL = lrLeft(firstCol), bR = lrRight(lastCol);
        const lx = lrLeft(firstCol) + LABEL_PAD;
        pushPoly(`${firstRow}-${firstCol}`, [
          { x: bL, y: yLastTop }, { x: bR, y: yLastTop },
          { x: bR, y: yLastBot }, { x: bL, y: yLastBot },
        ], label, lx, labelCenterY(lrIdx), lrRight(lastCol) - LABEL_PAD - lx);
        continue;
      }

      // Junction: grid portion (rows firstRow..lrIdx-1) + centered bottom row.
      const F = colRight(cols - 1);
      const yAboveBottom = tileTop(lrIdx - 1) + tileSize + pad;
      const jbL = lrLeft(0), jbR = lrRight(lastCol);
      const topLeftAtBottom = firstRow === lrIdx - 1 ? colLeft(firstCol) : colLeft(0);

      if (lastRowConnects(run)) {
        // One enclosing shape — the centered bottom necks up into the overlap.
        const pts: Pt[] = [
          { x: colLeft(firstCol), y: yTop },
          { x: F, y: yTop },
          { x: F, y: yAboveBottom },
        ];
        if (jbR < F - 0.01) pts.push({ x: jbR, y: yAboveBottom });
        pts.push({ x: jbR, y: yLastBot });
        pts.push({ x: jbL, y: yLastBot });
        if (jbL > topLeftAtBottom + 0.01) {
          // bottom contained within the row above → step in along its underside
          pts.push({ x: jbL, y: yAboveBottom });
          pts.push({ x: topLeftAtBottom, y: yAboveBottom });
        } else {
          // bottom spills left of the row above → step along the bottom's top edge
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

      // No x-overlap → two pieces with open inner edges (dots + fade), like the
      // in-grid ≤9 wrap. The grid portion is always a single row here: a full row
      // above the centered row would overlap it, so a disconnect is only ever the
      // 2-row case (firstRow === lrIdx - 1). The top continues off its right edge,
      // the centered bottom off its left.
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
        // Position-qualified so multiple runs of the same section never collide
        // (a bare `${sectionId}-last` key duplicates across runs → React renders
        // stacked, un-reconciled orphan outlines that pile up on re-render).
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

    // Two-row wrap with no column overlap (≤9 pokemon): two pieces with their
    // inner edges left open to read as continuation, name re-shown on row two.
    if (lastRow - firstRow === 1 && firstCol > lastCol + 1) {
      const yBotA = tileTop(firstRow) + tileSize + pad;
      shapes.push({
        // Position-qualified: a section can wrap in more than one place (build
        // order splits sections across the grid), so a bare `-a`/`-b` key would
        // collide between runs and leave duplicate outlines stacked on re-render.
        key: `${run.sectionId}-${firstRow}-${firstCol}-a`,
        sectionId: run.sectionId,
        fill: roundRectFill(xFirstL, yTop, xR, yBotA, radius, false, true),
        stroke: roundRectStroke(xFirstL, yTop, xR, yBotA, radius, false, true, dotTail + strokeW / 2),
        fillColor, strokeColor, label, labelAlts: run.labelAlts, labelX, labelY, labelMaxW,
        open: { side: 'right', x0: xFirstL, x1: xR, topY: yTop, botY: yBotA },
      });
      // lastRow is guaranteed a band row (see layout memo), so the re-shown
      // label has band space and the piece tops out uniformly.
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

    // Exactly-10 wrap (firstCol === lastCol + 1) is left to the contiguous-ribbon
    // path below: its staircase vertices "cross" at the two diagonally-adjacent
    // corners, and the spoon rounding (concave radius = convex + gap) pulls those
    // corners apart into a smooth diagonal join automatically. The name is not
    // re-shown (single ribbon outline).

    // Contiguous multi-row ribbon — one enclosing outline. The left step rises
    // to the band of the row below (so a last row sharing a band row reaches the
    // same height as the new section); the right step sits below the row above.
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

  // --- Corner spandrels ----------------------------------------------------
  // A curved 4-point star (or the section's type icon) in each interior corner
  // where (1) all four diagonally adjacent cells belong to the same section, and
  // (2) the lower of the two rows carries the extended top gap (it is a band row
  // — another section begins later in it).
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
    // Skip the centered overflow row for now — its cells are column-offset.
    if (lastRowGeom && below === lastRowGeom.index) continue;
    for (let c = 0; c < cols - 1; c++) {
      const s = secAt(n, c);
      if (!s || secAt(n, c + 1) !== s || secAt(below, c) !== s || secAt(below, c + 1) !== s) continue;
      // Centre of the corner gap, nudged a hair up-and-left so the lower-right
      // tile's position number (which sits toward this corner) doesn't crowd it.
      const cx = c * pitch + tileSize + gap / 2 - tileSize * 0.03;
      const cy = (tileTop(n) + tileSize + tileTop(below)) / 2 - tileSize * 0.03;
      spandrels.push({
        key: `sp-${n}-${c}`, cx, cy, r: tileSize * 0.16,
        color: secStroke.get(s) ?? '#555555', type: SECTION_TYPE[s] ?? null,
      });
    }
  }

  return { shapes, spandrels };
}

/** Compute the band-row sets and fit factors for an outlined grid. Shared by the
 *  View page (to size tiles) and the export (to lay out the canvas). */
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
