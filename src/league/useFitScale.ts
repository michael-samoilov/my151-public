import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Fit zoom: the whole template must sit inside the viewport, so the card (or
 * the league summary) and its hint lines shrink as one unit when the screen
 * is short. CSS `zoom` participates in layout and scales px, rem, text and
 * SVG together — the proportional shrink the responsive-sizing rules ask for.
 * The applied scale is divided out of `natural` so the loop is a fixed point,
 * not a spiral.
 *
 * The budget comes from the nearest `[data-lg-viewport]` ancestor, so a pane
 * that scrolls on its own is measured rather than the window.
 */
export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Below this the content stops being readable and a short scroll wins. */
  floor = 0.55,
): number {
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  /**
   * The largest scale already seen to overflow, and the budget it was seen
   * against.
   *
   * `zoom` scales the block's layout box, so a smaller scale is a *wider*
   * box in layout pixels — and text in a wider box wraps onto fewer lines.
   * The block's natural height is therefore not a constant, and one division
   * can land a few pixels over. Correcting that by shrinking then invites a
   * grow back to where it started, which is a two-state loop rather than a
   * fit.
   *
   * So a scale that overflowed is never offered again while the budget holds.
   * The corrections then only go one way and the fit settles. A real resize
   * clears the ceiling, which is what lets the block grow back on rotation.
   */
  const ceiling = useRef(1);
  const budget = useRef(Number.NaN);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const natural = rect.height / scaleRef.current;
      if (natural <= 0) return;
      let avail: number;
      if (viewport instanceof HTMLElement) {
        const vp = viewport.getBoundingClientRect();
        // clientHeight includes the container's own padding, so its bottom
        // padding must come out of the budget or the fit overflows by it.
        const padBottom = parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
        avail = viewport.clientHeight - (rect.top - vp.top + viewport.scrollTop) - padBottom - 2;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      if (!(Math.abs(avail - budget.current) <= 1)) {
        budget.current = avail;
        ceiling.current = 1;
      }
      // Half a pixel, not zero: a block whose height rounds up by a fraction
      // of a pixel has not overflowed anything a reader can see.
      if (rect.height > avail + 0.5) {
        ceiling.current = Math.min(ceiling.current, scaleRef.current - 0.004);
      }
      const next = Math.max(floor, Math.min(1, ceiling.current, avail / natural));
      // 0.003 ≈ 2–3px at card height: tight enough to actually fit, loose
      // enough not to churn on subpixel measurements.
      if (Math.abs(next - scaleRef.current) > 0.003) {
        scaleRef.current = next;
        setScale(next);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [ref, floor]);
  return scale;
}
