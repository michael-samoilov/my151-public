import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { coordinateLabel } from './coordinatePresentation';
import { GEN_AXIS, TYPE_AXIS, type GenAxisId, type TypeAxisId } from '../model/cells';

const GAP = 8;
const DRAG_PX = 6;
const BODY_COLS = TYPE_AXIS.length;
const BODY_ROWS = GEN_AXIS.length;

type Side = 'below' | 'above' | 'right' | 'left';
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

function tracks(scroller: HTMLElement): { cell: number; head: number; headRow: number } {
  const head = parseFloat(scroller.style.getPropertyValue('--head'));
  return {
    cell: parseFloat(scroller.style.getPropertyValue('--cell')),
    head,
    headRow: parseFloat(scroller.style.getPropertyValue('--head-row')) || head,
  };
}

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
  const cue = scroller.parentElement?.querySelector('[data-testid="favorites-scroll-cue"]');
  const cueTop = cue ? cue.getBoundingClientRect().top - origin.top : box.bottom;
  if (cueTop > box.top && cueTop < box.bottom) box.bottom = cueTop - GAP;
  return box.right > box.left && box.bottom > box.top ? box : null;
}

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
  // platform: `scrollHeight` excludes the outer border and rounds to an integer, so the clamp keeps 4px spare.
  const maxHeight = Math.max(0, view.bottom - view.top - 4);
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
    style.bottom = `clamp(0px, var(--cell) * ${BODY_ROWS - row} ${px(GAP - p.dy)}, var(--cell) * ${BODY_ROWS} - ${p.height}px)`;
  } else {
    const y = p.side === 'below' ? `${lineY(row + 1)} ${px(GAP + p.dy)}` : `${lineY(row)} ${px(p.dy)}`;
    style.top = `clamp(var(--head-row, var(--head)), ${y}, ${lineY(BODY_ROWS)} - ${p.height}px)`;
  }
  return style;
}

function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    let press: { x: number; y: number; inside: boolean; mouse: boolean } | null = null;
    const inPane = (target: EventTarget | null) => target instanceof Node
      && (Boolean(ref.current?.contains(target)) || (target instanceof Element && target.closest('[data-picker-keep-open]') != null));
    const onPointerDown = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, inside: inPane(event.target), mouse: event.pointerType === 'mouse' };
    };
    const onClick = (event: MouseEvent) => {
      // platform: A keyboard click has `detail` 0 and follows no pointerdown of its own.
      const start = event.detail > 0 ? press : null;
      press = null;
      if (inPane(event.target) || start?.inside) return;
      if (event.target instanceof Element && event.target.closest('button[data-testid^="favorites-cell-"], button[data-cell-control]')) return;
      const scroller = ref.current?.parentElement?.parentElement;
      if (scroller && event.target instanceof Node && scroller.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
      const dragged = start != null && start.mouse && Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_PX;
      if (!dragged) closeRef.current();
    };
    // platform: An open Radix tooltip handles Escape first and prevents its default, so this handler ignores `defaultPrevented`.
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
