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
   * The height the block may take at `scale`, in its own rem. Set while a
   * block that gives up its own height holds its zoom (`Compact`); Infinity
   * otherwise, and before the first measure.
   */
  budgetRem: number;
  /**
   * The pane's bottom padding the block spends, in screen px (only while it
   * holds its zoom). `fitStyle` hands it back to the pane as a negative
   * margin, so the pane still does not scroll.
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
}

/**
 * A block that can give up its own height: the league summary, whose layout
 * stages are in `homeLayout.ts`.
 *
 * It zooms like any other block until its zoom reaches the one it holds.
 * From there the zoom stays put and `Fit.budgetRem` says how much height the
 * block may spend, so its layout gives up spacing instead. The zoom goes
 * below the held one only when even the shortest layout does not fit.
 */
export interface Compact {
  /**
   * The height its layout takes with `budgetRem` to spend, at zoom 1, in
   * rem: its roomiest at Infinity, its tightest at 0.
   */
  heightRem: (budgetRem: number) => number;
  /**
   * The zoom it holds. `ceiling` is the grow cap (a sprite at exactly 1x),
   * so the zoom never moves while the spacing can still give. `floor` is the
   * fit's floor, so the zoom follows the window as before, and the spacing
   * gives only once the zoom has nowhere left to go.
   */
  holds: 'ceiling' | 'floor';
}

/**
 * Below this (px), the block's measured height and its layout's height are
 * the same: `offsetHeight` rounds to whole px.
 */
const EXTRA_EPS = 2;

export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  /** Below this the content stops being readable and a short scroll wins. */
  floor = 0.55,
  /** Desktop only: grow the block up to fill the pane instead of squashing. */
  grow?: Grow,
  /** A block that gives up its own height before its zoom shrinks. */
  compact?: Compact,
): Fit {
  const [fit, setFit] = useState<Fit>({ scale: 1, width: 0, budgetRem: Infinity, gutterPx: 0 });
  const scaleRef = useRef(1);
  const budgetRef = useRef(Infinity);
  const widthRef = useRef(0);
  const availRef = useRef(0);
  const roomRef = useRef(0);
  const naturalRef = useRef(0);
  const extraRef = useRef(0);
  // The latest `compact`, for the observer. Its function is a fresh object
  // each render; its two ends below restart the observer when they change.
  const compactRef = useRef(compact);
  useLayoutEffect(() => {
    compactRef.current = compact;
  });
  const roomiestRem = compact?.heightRem(Infinity);
  const shortestRem = compact?.heightRem(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      // Unzoomed layout height — not getBoundingClientRect()/scale. Zoomed
      // rects re-enter this observer when zoom changes; offsetHeight does not.
      // Hold wrap/font flicker the same way as avail/room.
      const measured = el.offsetHeight;
      const natural = stabilizeMeasure(measured, naturalRef.current);
      naturalRef.current = natural;
      if (natural <= 0) return;
      const rect = el.getBoundingClientRect();
      let avail: number;
      let padBottom = 0;
      let gapBelow = 0;
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
        gapBelow = parseFloat(getComputedStyle(el.parentElement ?? el).paddingTop) || 0;
        avail -= gapBelow;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      // A note drawn under the block at its own size, not the block's zoom
      // (the export popup, `LeagueRosterNudge`), takes its whole height off
      // the budget.
      const note = el.nextElementSibling;
      if (note instanceof HTMLElement && note.hasAttribute('data-fit-reserve')) {
        avail -= note.offsetHeight;
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
      const commit = (next: FitProposal, budgetRem: number, gutterPx = 0) => {
        scaleRef.current = next.scale;
        widthRef.current = next.width;
        budgetRef.current = budgetRem;
        setFit({ ...next, budgetRem, gutterPx });
      };
      const last = { scale: scaleRef.current, width: widthRef.current };
      const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const baseWidth = grow ? grow.baseWidthRem * rootFont : undefined;
      // The most the block zooms to: the sprite's 1x size when it grows, its
      // own size when it squashes.
      const ceiling = grow ? grow.targetSpritePx / (grow.spriteRem * rootFont) : 1;
      const c = compactRef.current;
      if (c) {
        // A held block takes every shrink at once: its spacing is sized to
        // the last px, so a held measure spills rows.
        const heldAvail = avail < availRef.current ? avail : stabilizeMeasure(avail, availRef.current);
        const heldRoom = room < roomRef.current ? room : stabilizeMeasure(room, roomRef.current);
        const hold = c.holds === 'ceiling' ? ceiling : floor;
        const roomiest = c.heightRem(Infinity) * rootFont;
        // What the block draws besides its layout, such as a note that
        // joins its tail, rides along at every layout. It is the measured
        // height less the layout's own, held against rounding noise.
        const drawn = c.heightRem(budgetRef.current) * rootFont;
        const extra = measured - drawn < EXTRA_EPS
          ? 0
          : stabilizeMeasure(measured - drawn, extraRef.current, EXTRA_EPS);
        extraRef.current = extra;
        // The zoom the roomiest layout would take. At or under the held zoom,
        // the zoom holds and the layout gives way instead.
        const free = Math.min(
          ceiling,
          baseWidth ? heldRoom / baseWidth : Infinity,
          heldAvail / (roomiest + extra),
        );
        // A held block draws shorter layouts, so the next free fit measures
        // its height afresh rather than holding one of those.
        if (free <= hold) {
          naturalRef.current = 0;
          availRef.current = heldAvail;
          roomRef.current = heldRoom;
          // The empty gutter under the block, the pane's padding and the gap
          // kept to match the one above, is the first room it spends.
          const spendable = heldAvail + padBottom + gapBelow;
          const next = proposeFit({
            mode: 'hold',
            shortest: c.heightRem(0) * rootFont + extra,
            avail: spendable,
            room: heldRoom,
            floor,
            hold,
            baseWidth,
            prevScale: last.scale,
            prevWidth: last.width,
          }) ?? last;
          // The zoom can hold while the pane changes, and the block then has
          // more or less height to spend.
          const budgetRem = (spendable / next.scale - extra) / rootFont;
          if (next === last && budgetRem === budgetRef.current) return;
          commit(next, budgetRem, padBottom);
          return;
        }
        if (drawn < roomiest) {
          // Out of the hold, but the block still draws a shorter layout, so
          // its height is not the one to fit. Draw the roomiest layout at the
          // held zoom first, where it fits; that resize measures it again.
          naturalRef.current = 0;
          commit(last, Infinity);
          return;
        }
      }
      // Hold ±a few px of pane flicker so zoom/width cannot chase it every frame.
      avail = stabilizeMeasure(avail, availRef.current);
      availRef.current = avail;
      room = stabilizeMeasure(room, roomRef.current);
      roomRef.current = room;
      if (baseWidth !== undefined) {
        // Uniform grow-fit: the block is laid out at a fixed rem width and
        // zoomed as one, so the whole card — cells, sprites, text — scales
        // together. It grows to whichever binds first, the pane's width (room)
        // or its height (avail), and no further than the sprite's 1x native
        // size. So a tall pane's spare height lifts the card up rather than
        // leaving whitespace, and the sprites ride up with it.
        const next = proposeFit({
          mode: 'grow',
          natural,
          avail,
          room,
          floor,
          baseWidth,
          spriteCeil: ceiling,
          prevScale: last.scale,
          prevWidth: last.width,
        });
        // A block that just stopped holding its zoom still has a budget to
        // drop, even when its zoom holds.
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
    // `grow` and `compact` are fresh objects each render, so depend on their
    // values, not their identity, or the effect would tear down and rebuild
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ref,
    floor,
    grow?.baseWidthRem,
    grow?.spriteRem,
    grow?.targetSpritePx,
    roomiestRem,
    shortestRem,
    compact?.holds,
  ]);
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
