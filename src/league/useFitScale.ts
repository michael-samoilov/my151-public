import { useLayoutEffect, useRef, useState } from 'react';

/** How to draw the fitted block: the scale, and the width to hold it at. */
export interface Fit {
  /** The scale, applied as CSS `zoom`. */
  scale: number;
  /**
   * The block's width in its own layout pixels, or 0 before it is measured.
   *
   * This is what makes the fit a scale. Left to itself the block fills its
   * parent, and `zoom` sizes a percentage against the *zoomed* coordinate
   * space — so a block at half scale lays out twice as wide and renders at
   * the same width it always had, losing only height. Held at a fixed number
   * of layout pixels instead, both of its sides scale together.
   */
  width: number;
}

/**
 * Fit scale: the whole template must sit inside the viewport, so the card (or
 * the league summary) and its hint lines shrink as one unit when the screen
 * is short.
 *
 * CSS `zoom` rather than a transform, for two reasons. It participates in
 * layout, so the block still takes the room it draws in and the footer below
 * it follows. And a transformed ancestor becomes the containing block for
 * `position: fixed` descendants, which the card's pickers are.
 *
 * The applied scale is divided out of `natural` so the loop is a fixed point,
 * not a spiral. The budget comes from the nearest `[data-lg-viewport]`
 * ancestor, so a pane that scrolls on its own is measured rather than the
 * window.
 */
export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Below this the content stops being readable and a short scroll wins. */
  floor = 0.55,
): Fit {
  const [fit, setFit] = useState<Fit>({ scale: 1, width: 0 });
  const scaleRef = useRef(1);
  const widthRef = useRef(0);
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
      // The room the block is drawn in, measured on the parent because the
      // parent is not scaled. At scale 1 the block already has exactly this
      // width, so pinning it changes nothing until the fit bites.
      const host = el.parentElement;
      let width = widthRef.current;
      if (host) {
        const pad = getComputedStyle(host);
        width = Math.max(
          0,
          host.clientWidth
            - (parseFloat(pad.paddingLeft) || 0)
            - (parseFloat(pad.paddingRight) || 0),
        );
      }
      const next = Math.min(1, Math.max(floor, avail / natural));
      // 0.003 ≈ 2–3px at card height: tight enough to actually fit, loose
      // enough not to churn on subpixel measurements.
      if (Math.abs(next - scaleRef.current) > 0.003 || Math.abs(width - widthRef.current) > 0.5) {
        scaleRef.current = next;
        widthRef.current = width;
        setFit({ scale: next, width });
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
  return fit;
}

/** The style a fitted block wears: scaled, and centred on what it left. */
export function fitStyle(fit: Fit): React.CSSProperties {
  return {
    zoom: fit.scale,
    width: fit.width || undefined,
    marginInline: 'auto',
  };
}
