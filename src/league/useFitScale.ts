import { useLayoutEffect, useRef, useState } from 'react';
import { useFitMode } from './fitMode';
import { proposeFit, stabilizeMeasure, type FitProposal } from './fitScaleMath';
import { SPRITE_RENDERING_VAR } from './spriteScale';

export interface Fit {
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
  budgetRem: number;
  gutterPx: number;
}

/**
 * CSS `zoom` rather than a transform, for two reasons. Zoom participates in
 * layout, so the block still takes the room it draws in and the footer below
 * it follows. And a transformed ancestor becomes the containing block for
 * `position: fixed` descendants, which the card's pickers are.
 */
interface Grow {
  baseWidthRem: number;
  spriteRem: number;
  targetSpritePx: number;
  dpr: number;
}

interface Compact {
  heightRem: (budgetRem: number) => number;
  holds: 'ceiling' | 'floor';
}

/**
 * Below this (px), the block's measured height and its layout's height are
 * the same: `offsetHeight` rounds to whole px.
 */
const EXTRA_EPS = 2;

export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  floor = 0.55,
  grow?: Grow,
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
  const compactRef = useRef(compact);
  useLayoutEffect(() => {
    compactRef.current = compact;
  });
  const roomiestRem = compact?.heightRem(Infinity);
  const shortestRem = compact?.heightRem(0);
  const hasGrow = grow !== undefined;
  const wholePixel = useFitMode();
  const { baseWidthRem, spriteRem, targetSpritePx, dpr } = grow ?? {
    baseWidthRem: 0,
    spriteRem: 1,
    targetSpritePx: 1,
    dpr: 1,
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      // Unzoomed layout height — not getBoundingClientRect()/scale. Zoomed
      // rects re-enter this observer when zoom changes; offsetHeight does not.
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
        gapBelow = parseFloat(getComputedStyle(el.parentElement ?? el).paddingTop) || 0;
        avail -= gapBelow;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      const note = el.nextElementSibling;
      if (note instanceof HTMLElement && note.hasAttribute('data-fit-reserve')) {
        avail -= note.offsetHeight;
      }
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
      const baseWidth = hasGrow ? baseWidthRem * rootFont : undefined;
      const ceiling = hasGrow ? targetSpritePx / (spriteRem * rootFont) : 1;
      const c = compactRef.current;
      if (c) {
        const heldAvail = avail < availRef.current ? avail : stabilizeMeasure(avail, availRef.current);
        const heldRoom = room < roomRef.current ? room : stabilizeMeasure(room, roomRef.current);
        const hold = c.holds === 'ceiling' ? ceiling : floor;
        const roomiest = c.heightRem(Infinity) * rootFont;
        const drawn = c.heightRem(budgetRef.current) * rootFont;
        const extra = measured - drawn < EXTRA_EPS
          ? 0
          : stabilizeMeasure(measured - drawn, extraRef.current, EXTRA_EPS);
        extraRef.current = extra;
        const free = Math.min(
          ceiling,
          baseWidth ? heldRoom / baseWidth : Infinity,
          heldAvail / (roomiest + extra),
        );
        if (free <= hold) {
          naturalRef.current = 0;
          availRef.current = heldAvail;
          roomRef.current = heldRoom;
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
          const budgetRem = (spendable / next.scale - extra) / rootFont;
          if (next === last && budgetRem === budgetRef.current) return;
          commit(next, budgetRem, padBottom);
          return;
        }
        if (drawn < roomiest) {
          naturalRef.current = 0;
          commit(last, Infinity);
          return;
        }
      }
      avail = stabilizeMeasure(avail, availRef.current);
      availRef.current = avail;
      room = stabilizeMeasure(room, roomRef.current);
      roomRef.current = room;
      if (baseWidth !== undefined) {
        const next = proposeFit({
          mode: 'grow',
          natural,
          avail,
          room,
          floor,
          baseWidth,
          spriteCeil: ceiling,
          spritePx: spriteRem * rootFont,
          dpr,
          wholePixel,
          prevScale: last.scale,
          prevWidth: last.width,
        });
        if (next || budgetRef.current !== Infinity) commit(next ?? last, Infinity);
        return;
      }
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
  }, [
    ref,
    floor,
    hasGrow,
    baseWidthRem,
    spriteRem,
    targetSpritePx,
    dpr,
    wholePixel,
    roomiestRem,
    shortestRem,
    compact?.holds,
  ]);
  return fit;
}

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
