import { useLayoutEffect, useRef, useState } from 'react';
import { proposeFit, stabilizeMeasure, type FitProposal } from './fitScaleMath';
import { SPRITE_RENDERING_VAR } from './spriteScale';

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
  /**
   * The height the block may take at `scale`, in its own rem. Set for a
   * block that holds its sprites (`Grow.shortestRem`); Infinity otherwise,
   * and before the first measure.
   */
  budgetRem: number;
  /**
   * The pane's bottom padding the block spends, in screen px (a block that
   * holds its sprites only). `fitStyle` hands it back to the pane as a
   * negative margin, so the pane still does not scroll.
   */
  gutterPx: number;
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
 * Natural height is read from `offsetHeight`, which is the unzoomed layout
 * size. Dividing a zoomed `getBoundingClientRect` by the last scale can chase
 * its own zoom under ResizeObserver; offsetHeight does not. The settle step
 * in `fitScaleMath` then deadbands small avail/room flicker so the observer
 * loop reaches a fixed point instead of vibrating every frame.
 *
 * The budget comes from the nearest `[data-lg-viewport]` ancestor, so a pane
 * that scrolls on its own is measured rather than the window.
 */
/**
 * Desktop grow mode: instead of squashing to fit, the block lays out at a fixed
 * rem width and zooms *up* uniformly to fill whichever runs out first — the
 * pane's width or its height — so the card and its sprites grow to use the
 * vertical room a tall pane leaves. The zoom is capped so the sprites never
 * pass their 1x native size (the size the Pokémon browser draws them at).
 */
export interface Grow {
  /** The block's layout width, in rem. Sets the card's proportions; the zoom
   *  then scales the whole thing. */
  baseWidthRem: number;
  /** The sprite's own size in rem, so the cap can be read in the same units. */
  spriteRem: number;
  /** The largest the sprite may render, in px (the browser's 1x native size). */
  targetSpritePx: number;
  /**
   * For a block that holds its sprites at `targetSpritePx` and gives up its
   * own spacing first: its tightest height at zoom 1, in rem. The zoom then
   * fits that height instead of the measured one, sits exactly on the
   * ceiling whenever it can, and `Fit.budgetRem` says what the block may
   * spend.
   */
  shortestRem?: number;
}

export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Below this the content stops being readable and a short scroll wins. */
  floor = 0.55,
  /** Desktop only: grow the block up to fill the pane instead of squashing. */
  grow?: Grow,
): Fit {
  const [fit, setFit] = useState<Fit>({ scale: 1, width: 0, budgetRem: Infinity, gutterPx: 0 });
  const scaleRef = useRef(1);
  const budgetRef = useRef(Infinity);
  const widthRef = useRef(0);
  const availRef = useRef(0);
  const roomRef = useRef(0);
  const naturalRef = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      // Unzoomed layout height — not getBoundingClientRect()/scale. Zoomed
      // rects re-enter this observer when zoom changes; offsetHeight does not.
      // Hold wrap/font flicker the same way as avail/room.
      const natural = stabilizeMeasure(el.offsetHeight, naturalRef.current);
      naturalRef.current = natural;
      if (natural <= 0) return;
      const rect = el.getBoundingClientRect();
      let avail: number;
      let padBottom = 0;
      if (viewport instanceof HTMLElement) {
        const vp = viewport.getBoundingClientRect();
        // clientHeight includes the container's own padding, so its bottom
        // padding must come out of the budget or the fit overflows by it.
        padBottom = parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
        avail = viewport.clientHeight - (rect.top - vp.top + viewport.scrollTop) - padBottom - 2;
        // Leave as much room under the block as sits above it. The block's
        // own parent holds that gap as padding-top — between the card and the
        // ribbon over it — and without matching it below, the last hint line
        // ends flush with the fold.
        avail -= parseFloat(getComputedStyle(el.parentElement ?? el).paddingTop) || 0;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      // Hold ±a few px of pane flicker so zoom/width cannot chase it every frame.
      // A block that holds its sprites takes every shrink at once: its
      // spacing is sized to the last px, so a held measure spills rows.
      const pinned = grow?.shortestRem !== undefined;
      const settle = (next: number, prev: number) =>
        pinned && next < prev ? next : stabilizeMeasure(next, prev);
      avail = settle(avail, availRef.current);
      availRef.current = avail;
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
      room = settle(room, roomRef.current);
      roomRef.current = room;
      const commit = (next: FitProposal, budgetRem: number, gutterPx = 0) => {
        scaleRef.current = next.scale;
        widthRef.current = next.width;
        budgetRef.current = budgetRem;
        setFit({ ...next, budgetRem, gutterPx });
      };
      const last = { scale: scaleRef.current, width: widthRef.current };
      if (grow) {
        // Uniform grow-fit: the block is laid out at a fixed rem width and
        // zoomed as one, so the whole card — cells, sprites, text — scales
        // together. It grows to whichever binds first, the pane's width (room)
        // or its height (avail), and no further than the sprite's 1x native
        // size. So a tall pane's spare height lifts the card up rather than
        // leaving whitespace, and the sprites ride up with it.
        const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const baseWidth = grow.baseWidthRem * rootFont;
        const spriteCeil = grow.targetSpritePx / (grow.spriteRem * rootFont);
        if (grow.shortestRem !== undefined) {
          // The empty gutter under the block is the first room it spends:
          // on a short window, 1x sprites are worth more than the whitespace.
          const spendable = avail + padBottom;
          const next = proposeFit({
            mode: 'pin',
            shortest: grow.shortestRem * rootFont,
            avail: spendable,
            room,
            floor,
            baseWidth,
            spriteCeil,
            prevScale: last.scale,
            prevWidth: last.width,
          }) ?? last;
          // The zoom can hold while the pane changes, and the block then has
          // more or less height to spend.
          const budgetRem = spendable / (next.scale * rootFont);
          if (next === last && budgetRem === budgetRef.current) return;
          commit(next, budgetRem, padBottom);
          return;
        }
        const next = proposeFit({
          mode: 'grow',
          natural,
          avail,
          room,
          floor,
          baseWidth,
          spriteCeil,
          prevScale: last.scale,
          prevWidth: last.width,
        });
        // A block that just stopped holding its sprites still has a budget
        // to drop, even when its zoom holds.
        if (next || budgetRef.current !== Infinity) commit(next ?? last, Infinity);
        return;
      }
      // What the block would be scaled to if only its body had to fit. The
      // layout width grows by exactly that much, so the zoom gives the body's
      // width straight back and the squash costs it only height. What is left
      // over is the tail's, and that part is not given back.
      const tail = el.querySelector('[data-fit-tail]');
      const tailNatural = tail instanceof HTMLElement ? tail.offsetHeight : 0;
      const next = proposeFit({
        mode: 'squash',
        natural,
        tailNatural,
        avail,
        room,
        floor,
        prevScale: last.scale,
        prevWidth: last.width,
      });
      if (next || budgetRef.current !== Infinity) commit(next ?? last, Infinity);
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
    // `grow` is a fresh object each render, so depend on its fields, not its
    // identity, or the effect would tear down and rebuild every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, floor, grow?.baseWidthRem, grow?.spriteRem, grow?.targetSpritePx, grow?.shortestRem]);
  return fit;
}

/**
 * The style a fitted block wears: scaled, and centred on what it left. The
 * block also tells its sprites how to draw at that scale
 * (`spriteRendering`), when it has decided.
 */
export function fitStyle(fit: Fit, rendering?: 'pixelated' | 'auto'): React.CSSProperties {
  return {
    zoom: fit.scale,
    width: fit.width || undefined,
    marginInline: 'auto',
    // The margin sits on the zoomed block, so it is zoomed too.
    ...(fit.gutterPx ? { marginBottom: -fit.gutterPx / fit.scale } : null),
    ...(rendering ? { [SPRITE_RENDERING_VAR]: rendering } : null),
  };
}
