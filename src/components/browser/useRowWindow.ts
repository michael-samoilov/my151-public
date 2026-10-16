import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const OVERSCAN = 4;

const SEED_ROWS = 3;

const pitchCache = new Map<string, { pitch: number; gap: number }>();

interface RowWindow {
  start: number;
  end: number;
  topPad: number;
  bottomPad: number;
}

interface WindowState {
  start: number;
  end: number;
  pitch: number;
  gap: number;
}

function findScroller(el: HTMLElement | null): HTMLElement | null {
  let n: HTMLElement | null = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
}

export function useRowWindow(
  gridRef: React.RefObject<HTMLDivElement | null>,
  rows: readonly unknown[],
  enabled: boolean,
  pitchKey: string,
): RowWindow {
  const rowCount = rows.length;
  const [win, setWin] = useState<WindowState>(() => {
    const known = pitchCache.get(pitchKey);
    return {
      start: 0,
      end: known ? 0 : Math.min(rowCount, SEED_ROWS),
      pitch: known?.pitch ?? 0,
      gap: known?.gap ?? 0,
    };
  });

  const recompute = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const scroller = findScroller(grid);
    if (!scroller) return;

    setWin((prev) => {
      let { pitch, gap } = prev;
      if (pitch <= 0) {
        const known = pitchCache.get(pitchKey);
        if (known) {
          pitch = known.pitch;
          gap = known.gap;
        } else {
          const cell = grid.querySelector<HTMLElement>('[data-row-cell]');
          const h = cell?.getBoundingClientRect().height ?? 0;
          if (h <= 0) return prev;
          gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
          pitch = h + gap;
          pitchCache.set(pitchKey, { pitch, gap });
        }
      }

      const gridTop =
        grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const relTop = scroller.scrollTop - gridTop;
      const view = scroller.clientHeight;

      const start = Math.max(0, Math.min(rowCount, Math.floor(relTop / pitch) - OVERSCAN));
      const end = Math.max(start, Math.min(rowCount, Math.ceil((relTop + view) / pitch) + OVERSCAN));
      if (prev.start === start && prev.end === end && prev.pitch === pitch && prev.gap === gap) {
        return prev;
      }
      return { start, end, pitch, gap };
    });
  }, [gridRef, pitchKey, rowCount]);

  useLayoutEffect(() => {
    if (!enabled) return;
    recompute();
  }, [enabled, recompute, rows]);

  useEffect(() => {
    if (!enabled) return;
    const grid = gridRef.current;
    if (!grid) return;
    const scroller = findScroller(grid);
    if (!scroller) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        recompute();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, gridRef, recompute]);

  if (!enabled) return { start: 0, end: rowCount, topPad: 0, bottomPad: 0 };

  const start = Math.min(win.start, rowCount);
  const end = Math.min(Math.max(win.end, start), rowCount);
  const topPad = win.pitch > 0 && start > 0 ? start * win.pitch - win.gap : 0;
  const bottomPad = win.pitch > 0 && end < rowCount ? (rowCount - end) * win.pitch - win.gap : 0;
  return { start, end, topPad, bottomPad };
}
