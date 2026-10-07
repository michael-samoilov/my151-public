import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { coordinateLabel } from './coordinatePresentation';
import { GEN_AXIS, TYPE_AXIS, type GenAxisId, type TypeAxisId } from '../model/cells';

/** Space between the pane and its cell, in CSS px. */
const GAP = 8;
/** A mouse press that moves farther than this before release is a drag. */
const DRAG_PX = 6;
const BODY_COLS = TYPE_AXIS.length;
const BODY_ROWS = GEN_AXIS.length;

type Side = 'below' | 'above' | 'right' | 'left';
/**
 * Where the pane sits next to its cell. `dx` and `dy` shift it from that
 * side's anchor, so it opens inside the visible grid body. `width` and
 * `height` are the measured pane size that keeps it inside the grid content.
 */
type Placement = {
  side: Side;
  dx: number;
  dy: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
};
type Box = { left: number; top: number; right: number; bottom: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function samePlacement(a: Placement | null, b: Placement): boolean {
  return a != null && a.side === b.side && a.dx === b.dx && a.dy === b.dy && a.width === b.width
    && a.height === b.height && a.maxWidth === b.maxWidth && a.maxHeight === b.maxHeight;
}

/**
 * The desktop selector pane. FavoritesGrid renders it inside the grid, so it
 * scrolls with the grid and the sticky headers paint over it. Its position is
 * CSS in `--cell`, `--head`, and `--head-row`, so a zoom moves it with its cell in the same
 * frame. Only the first placement, a pane resize, and a frame resize measure.
 *
 * The pane is as wide as its content, and at least `minWidth`, so a narrow
 * selector still fits its header.
 */
export function DesktopPane({
  type,
  gen,
  minWidth,
  onClose,
  children,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  minWidth: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const col = TYPE_AXIS.indexOf(type);
  const row = GEN_AXIS.indexOf(gen);
  const [placement, setPlacement] = useState<Placement | null>(null);
  useDismiss(ref, onClose);

  useLayoutEffect(() => {
    const pane = ref.current;
    const grid = pane?.parentElement;
    const scroller = grid?.parentElement;
    if (!pane || !grid || !scroller) return;
    let first = true;
    const update = () => {
      const next = placePane(pane, grid, scroller, col, row, first);
      first = false;
      if (next) setPlacement((current) => (samePlacement(current, next) ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [col, row, minWidth]);

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={coordinateLabel(type, gen)}
      className="absolute z-[15] flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
      style={{
        width: 'max-content',
        ...(placement ? paneStyle(col, row, placement, minWidth) : { left: 0, top: 0, minWidth, visibility: 'hidden' }),
      }}
      data-testid="favorites-picker"
    >
      {children}
    </aside>
  );
}

/** Track sizes in CSS px, read from the grid scroller's custom properties. */
function tracks(scroller: HTMLElement): { cell: number; head: number; headRow: number } {
  const head = parseFloat(scroller.style.getPropertyValue('--head'));
  return {
    cell: parseFloat(scroller.style.getPropertyValue('--cell')),
    head,
    // The header row can be taller than the generation column is wide.
    headRow: parseFloat(scroller.style.getPropertyValue('--head-row')) || head,
  };
}

/**
 * The grid body that is on screen, in grid content px: inside the scrollport,
 * past the sticky headers, and inside the visual viewport.
 */
function visibleBody(grid: HTMLElement, scroller: HTMLElement): Box | null {
  const { cell, head, headRow } = tracks(scroller);
  if (!(cell > 0) || !(head > 0)) return null;
  const origin = grid.getBoundingClientRect();
  const frame = scroller.getBoundingClientRect();
  const portLeft = frame.left + scroller.clientLeft - origin.left;
  const portTop = frame.top + scroller.clientTop - origin.top;
  const visual = window.visualViewport;
  const screenLeft = (visual?.offsetLeft ?? 0) - origin.left;
  const screenTop = (visual?.offsetTop ?? 0) - origin.top;
  const box = {
    left: Math.max(head, portLeft + head, screenLeft),
    top: Math.max(headRow, portTop + headRow, screenTop),
    right: Math.min(head + cell * BODY_COLS, portLeft + scroller.clientWidth, screenLeft + (visual?.width ?? window.innerWidth)),
    bottom: Math.min(headRow + cell * BODY_ROWS, portTop + scroller.clientHeight, screenTop + (visual?.height ?? window.innerHeight)),
  };
  // The first-scroll cue lives above the grid's stacking context. Keep a
  // short selector clear of its visible bottom band rather than hiding rows.
  const cue = scroller.parentElement?.querySelector('[data-testid="favorites-scroll-cue"]');
  const cueTop = cue ? cue.getBoundingClientRect().top - origin.top : box.bottom;
  if (cueTop > box.top && cueTop < box.bottom) box.bottom = cueTop - GAP;
  return box.right > box.left && box.bottom > box.top ? box : null;
}

/**
 * Picks the side of the cell for the pane: below, above, right, then left,
 * the first where the pane fits in the visible grid body. On the first
 * placement, a zoomed cell can leave room on no side, so the grid scrolls
 * sideways once to open room.
 */
function placePane(
  pane: HTMLElement,
  grid: HTMLElement,
  scroller: HTMLElement,
  col: number,
  row: number,
  first: boolean,
): Placement | null {
  let view = visibleBody(grid, scroller);
  if (!view) return null;
  const { cell, head, headRow } = tracks(scroller);
  const maxWidth = view.right - view.left;
  const width = Math.min(pane.offsetWidth, maxWidth);
  // scrollHeight excludes the outer border and rounds to an integer, so
  // reserve a few pixels before clamping against the visible body.
  const maxHeight = Math.max(0, view.bottom - view.top - 4);
  // A capped flex body hides its overflow from pane.scrollHeight. Measure
  // its full content so a short selector can grow instead of retaining a cap.
  const contentHeight = [...pane.children].reduce((height, child) =>
    height + Math.max(child.scrollHeight, child.getBoundingClientRect().height), 0);
  const height = Math.min(contentHeight + 4, maxHeight);
  const box = { left: head + cell * col, top: headRow + cell * row, right: head + cell * (col + 1), bottom: headRow + cell * (row + 1) };
  const fitsBeside = (room: Box) => box.bottom + GAP + height <= room.bottom
    || box.top - height - GAP >= room.top
    || box.right + GAP + width <= room.right
    || box.left - width - GAP >= room.left;
  if (first && !fitsBeside(view)) {
    const toLeft = box.right + GAP + width - view.right;
    const toRight = view.left - (box.left - width - GAP);
    scroller.scrollBy({ left: toLeft <= toRight ? toLeft : -toRight, behavior: 'instant' });
    view = visibleBody(grid, scroller) ?? view;
  }
  const below = box.bottom + GAP;
  const above = box.top - height - GAP;
  const right = box.right + GAP;
  const left = box.left - width - GAP;
  // Prefer below or above the cell. A zoomed cell can leave no room for
  // either, so fall back to its side before covering it.
  const side: Side = below + height <= view.bottom ? 'below'
    : above >= view.top ? 'above'
      : right + width <= view.right ? 'right'
        : left >= view.left ? 'left'
          : 'below';
  const anchor = side === 'below' ? { x: box.left, y: below }
    : side === 'above' ? { x: box.left, y: above }
      : side === 'right' ? { x: right, y: box.top }
        : { x: left, y: box.top };
  const x = clamp(anchor.x, view.left, view.right - width);
  const y = clamp(anchor.y, view.top, view.bottom - height);
  return { side, dx: x - anchor.x, dy: y - anchor.y, width, height, maxWidth, maxHeight };
}

/**
 * The pane position as CSS lengths in the grid's own track sizes. It keeps
 * the pane inside the grid content and off the sticky headers at scroll 0.
 */
function paneStyle(col: number, row: number, p: Placement, minWidth: number): CSSProperties {
  const line = (n: number) => `var(--head) + var(--cell) * ${n}`;
  const lineY = (n: number) => `var(--head-row, var(--head)) + var(--cell) * ${n}`;
  const px = (n: number) => (n < 0 ? `- ${-n}px` : `+ ${n}px`);
  const x = p.side === 'right' ? `${line(col + 1)} ${px(GAP + p.dx)}`
    : p.side === 'left' ? `${line(col)} ${px(p.dx - GAP - p.width)}`
      : `${line(col)} ${px(p.dx)}`;
  const style: CSSProperties = {
    minWidth: Math.min(minWidth, p.maxWidth),
    maxWidth: p.maxWidth,
    maxHeight: p.maxHeight,
    left: `clamp(var(--head), ${x}, ${line(BODY_COLS)} - ${p.width}px)`,
  };
  if (p.side === 'above') {
    // Anchor the bottom edge, so the pane grows upward from its cell.
    style.bottom = `clamp(0px, var(--cell) * ${BODY_ROWS - row} ${px(GAP - p.dy)}, var(--cell) * ${BODY_ROWS} - ${p.height}px)`;
  } else {
    const y = p.side === 'below' ? `${lineY(row + 1)} ${px(GAP + p.dy)}` : `${lineY(row)} ${px(p.dy)}`;
    style.top = `clamp(var(--head-row, var(--head)), ${y}, ${lineY(BODY_ROWS)} - ${p.height}px)`;
  }
  return style;
}

/**
 * Closes the pane on Escape or on a click outside it. A click on the grid
 * only closes the pane; it does not also open the cell under the pointer.
 * A mouse drag, such as on the minimap, is not a click.
 */
function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    let press: { x: number; y: number; inside: boolean; mouse: boolean } | null = null;
    // A click in the sort debug panel (`?sortdebug=1`) reorders the open pane
    // in place, so it does not close it.
    const inPane = (target: EventTarget | null) => target instanceof Node
      && (Boolean(ref.current?.contains(target)) || (target instanceof Element && target.closest('[data-picker-keep-open]') != null));
    const onPointerDown = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, inside: inPane(event.target), mouse: event.pointerType === 'mouse' };
    };
    const onClick = (event: MouseEvent) => {
      // A keyboard click (detail 0) has no press of its own.
      const start = event.detail > 0 ? press : null;
      press = null;
      if (inPane(event.target) || start?.inside) return;
      // Grid cells handle replacement and selected-cell dismissal themselves.
      if (event.target instanceof Element && event.target.closest('button[data-testid^="favorites-cell-"]')) return;
      const scroller = ref.current?.parentElement?.parentElement;
      if (scroller && event.target instanceof Node && scroller.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
      const dragged = start != null && start.mouse && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_PX;
      if (!dragged) closeRef.current();
    };
    // An open Radix tooltip handles Escape first and prevents its default.
    // The same Escape still closes the pane, so this ignores defaultPrevented.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ref]);
}
