import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/** Rows rendered beyond each edge of the viewport, so a fast flick finds
 *  tiles already mounted instead of blank space. */
const OVERSCAN = 4;

/** Rows rendered before a row pitch is known, only for the first grid to
 *  mount at a given tile size. Kept small: every subgroup grid renders its
 *  own seed, so a large one multiplies across the whole list. */
const SEED_ROWS = 3;

/**
 * Row pitch by tile size, shared across grids.
 *
 * Every browser grid draws the same tile at the same size, so the first grid
 * to measure hands the pitch to the rest. Without this, a grid that starts
 * below the fold could never measure — it renders no rows, so it has nothing
 * to measure — and would be stuck rendering its seed forever.
 */
const pitchCache = new Map<string, { pitch: number; gap: number }>();

interface RowWindow {
  start: number;
  end: number;
  /** Height of the filler standing in for rows before `start`, in px. */
  topPad: number;
  /** Height of the filler standing in for rows after `end`, in px. */
  bottomPad: number;
}

interface WindowState {
  start: number;
  end: number;
  /** Distance between the tops of consecutive rows, in px. 0 until measured. */
  pitch: number;
  /** The grid's row gap, in px. */
  gap: number;
}

/** Nearest scrollable ancestor — the element whose scrollTop moves this grid. */
function findScroller(el: HTMLElement | null): HTMLElement | null {
  let n: HTMLElement | null = el?.parentElement ?? null;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === 'auto' || oy === 'scroll') return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Windows a uniform-height grid to the rows near the viewport.
 *
 * The browser's result grid holds ~1,300 tiles at ~14 DOM nodes each. Mounting
 * them all costs seconds on a mid-tier phone, and no amount of scheduling
 * makes that cheap — the work has to not happen. Rows here are uniform height
 * (every tile is sized off `--tile-sprite`, and single-type tiles carry a
 * spacer so their badge block matches dual-type ones), so one measured row
 * pitch describes the whole grid and the rows outside the window can be
 * replaced by two fillers.
 */
export function useRowWindow(
  gridRef: React.RefObject<HTMLDivElement | null>,
  /** The rows to window. Passed as the array, not its length: a grid's
   *  position in the list can move without its row count changing — applying
   *  a generation filter lifts that generation's grid from far down the list
   *  to the top with the same rows — and the window has to be recomputed for
   *  the new position. The array identity changes whenever the result set
   *  does, so it is the signal that the old window may no longer hold. */
  rows: readonly unknown[],
  enabled: boolean,
  /** Identifies grids that share a row height, for the pitch cache. */
  pitchKey: string,
): RowWindow {
  const rowCount = rows.length;
  const [win, setWin] = useState<WindowState>(() => {
    const known = pitchCache.get(pitchKey);
    return {
      start: 0,
      // With a known pitch the first layout effect sets the real window before
      // paint, so nothing needs to be rendered speculatively.
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
          if (h <= 0) return prev; // nothing rendered yet; the seed will arrive
          gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
          pitch = h + gap;
          pitchCache.set(pitchKey, { pitch, gap });
        }
      }

      // Where this grid starts within the scroller's content.
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

  // Correct the window before paint, so a seed render is never shown and a
  // new result set never paints more rows than fit.
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
  // Each filler replaces N rows *and* the gaps between them, but is itself a
  // grid row that contributes one more gap — hence the trailing subtraction.
  const topPad = win.pitch > 0 && start > 0 ? start * win.pitch - win.gap : 0;
  const bottomPad = win.pitch > 0 && end < rowCount ? (rowCount - end) * win.pitch - win.gap : 0;
  return { start, end, topPad, bottomPad };
}
