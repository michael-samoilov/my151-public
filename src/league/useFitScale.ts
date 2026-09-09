import { useLayoutEffect, useRef, useState } from 'react';

/** How to draw the fitted block: the scale, and the width to hold it at. */
export interface Fit {
  /** The scale, applied as CSS `zoom`. */
  scale: number;
  /**
   * The block's width in its own layout pixels, or 0 before it is measured.
   *
   * This is the knob that decides *how* the block shrinks. Left to itself it
   * fills its parent, and `zoom` sizes a percentage against the *zoomed*
   * coordinate space — so a block at half scale lays out twice as wide and
   * renders at the width it always had, losing only height. Widening it by
   * exactly the squash keeps that; leaving it alone scales both sides.
   */
  width: number;
}

/**
 * Fit scale: the whole template must sit inside the viewport, so the card (or
 * the league summary) and its hint lines shrink as one unit when the screen
 * is short.
 *
 * The shrink is deliberately two different things. The card itself squashes:
 * it keeps the full width of the pane and gives up only height, which is what
 * `zoom` on a width-filling block does by itself, and what keeps a row's
 * touch targets as wide as the screen allows. The **tail** — the hint lines
 * under the card, marked `data-fit-tail` — is not paid for that way.
 * Squashing the card further to make room for two lines of 10px text is the
 * wrong trade, so the room they need comes off both sides at once and the
 * block narrows by a few percent instead.
 *
 * That is the whole rule: squash to fit the body, scale to fit the tail. With
 * no tail it is a plain squash; with a body that already fits it is a plain
 * scale.
 *
 * CSS `zoom` rather than a transform, for two reasons. Zoom participates in
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
        // Leave as much room under the block as sits above it. The block's
        // own parent holds that gap as padding-top — between the card and the
        // ribbon over it — and without matching it below, the last hint line
        // ends flush with the fold.
        avail -= parseFloat(getComputedStyle(el.parentElement ?? el).paddingTop) || 0;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      // The room the block is drawn in, measured on the parent because the
      // parent is not scaled.
      const host = el.parentElement;
      let room = widthRef.current;
      if (host) {
        const pad = getComputedStyle(host);
        room = Math.max(
          0,
          host.clientWidth
            - (parseFloat(pad.paddingLeft) || 0)
            - (parseFloat(pad.paddingRight) || 0),
        );
      }
      // What the block would be scaled to if only its body had to fit. The
      // layout width grows by exactly that much, so the zoom gives the body's
      // width straight back and the squash costs it only height. What is left
      // over is the tail's, and that part is not given back.
      const tail = el.querySelector('[data-fit-tail]');
      const body = Math.max(
        1,
        natural - (tail ? tail.getBoundingClientRect().height / scaleRef.current : 0),
      );
      const squash = Math.min(1, Math.max(floor, avail / body));
      const width = room / squash;
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
    // The parent as well as the block. Pinning the block's width is what
    // makes it stop following its parent: it no longer resizes when the pane
    // does, so an observer on the block alone goes quiet and keeps a width
    // measured against a pane that has since changed. On a desktop card that
    // left the card 52px wider than the pane it sits in, hanging over the
    // edge where nothing could be pressed.
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    if (viewport instanceof HTMLElement) ro.observe(viewport);
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
