import { useLayoutEffect, useRef, useState } from 'react';
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
  /** Whether the block's `[data-fit-tail]` hint lines show. See `Grow.tail`. */
  tail: boolean;
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
  /**
   * The block's `[data-fit-tail]` hint lines show only where they fit whole
   * below the block at its sharp size, so they never cost the sprites their
   * whole pixels. Hidden, the tail stays in the block at zero height, and its
   * `scrollHeight` still measures it.
   */
  tail?: boolean;
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

/**
 * `held` keeps the last fit and measures nothing while it is set. A card
 * zoomed past its fit moves the block's rects with the zoom and with its
 * frame's scroll, and the fit must not follow either. It measures once more
 * when `held` clears.
 */
export function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  floor = 0.55,
  grow?: Grow,
  compact?: Compact,
  held = false,
): Fit {
  const [fit, setFit] = useState<Fit>({ scale: 1, width: 0, budgetRem: Infinity, gutterPx: 0, tail: true });
  const scaleRef = useRef(1);
  const tailRef = useRef(true);
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
  const growTail = grow?.tail ?? false;
  const { baseWidthRem, spriteRem, targetSpritePx, dpr } = grow ?? {
    baseWidthRem: 0,
    spriteRem: 1,
    targetSpritePx: 1,
    dpr: 1,
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || held) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      // Unzoomed layout height — not getBoundingClientRect()/scale. Zoomed
      // rects re-enter this observer when zoom changes; offsetHeight does not.
      const hints = hasGrow && growTail ? el.querySelector<HTMLElement>('[data-fit-tail]') : null;
      const measured = el.offsetHeight - (hints?.offsetHeight ?? 0);
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
        tailRef.current = next.tail ?? true;
        widthRef.current = next.width;
        budgetRef.current = budgetRem;
        setFit({ ...next, tail: next.tail ?? true, budgetRem, gutterPx });
      };
      const last = { scale: scaleRef.current, width: widthRef.current, tail: tailRef.current };
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
      const liveAvail = avail;
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
          tail: hints?.scrollHeight ?? 0,
          // The lines may take the gap kept under the block, down to the
          // pane's bottom padding, so the pane never scrolls for them.
          tailRoom: liveAvail + 2 + gapBelow,
          prevTail: last.tail,
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
    if (viewport instanceof HTMLElement) {
      ro.observe(viewport);
      // A tip opening above the block inside the same scroller moves the block down
      // without resizing anything observed here.
      viewport.querySelectorAll('[data-tip-slot]').forEach((slot) => ro.observe(slot));
    }
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
    growTail,
    roomiestRem,
    shortestRem,
    compact?.holds,
    held,
  ]);
  return fit;
}

/**
 * Divide a container query length by this inside a fitted block.
 *
 * WebKit sizes `cqw` from the container's zoomed width and then zooms the
 * length again. Measured on WebKitGTK 2.52, the harness's iOS lane: inside
 * `zoom: 0.784`, `100cqw` in a 130px container is 102px, and Blink and Gecko
 * make it 130px. The probe sets this to the zoom only where an engine does
 * that, so everywhere else the division is by 1.
 */
export const CQ_ZOOM_VAR = '--cq-zoom';

let cqUnitsZoomed: boolean | undefined;

function containerUnitsZoomed(): boolean {
  if (cqUnitsZoomed !== undefined) return cqUnitsZoomed;
  if (typeof document === 'undefined' || !document.body) return false;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;visibility:hidden;zoom:0.5;width:100px;container-type:inline-size';
  const unit = document.createElement('div');
  unit.style.width = '100cqw';
  box.append(unit);
  document.body.append(box);
  cqUnitsZoomed = unit.offsetWidth < 75;
  box.remove();
  return cqUnitsZoomed;
}

/** `cardZoom` is the card's own zoom on top of its fit (`useCardZoom`). */
export function fitStyle(fit: Fit, rendering?: 'pixelated' | 'auto', cardZoom = 1): React.CSSProperties {
  const zoom = fit.scale * cardZoom;
  return {
    zoom,
    [CQ_ZOOM_VAR as string]: containerUnitsZoomed() ? zoom : 1,
    width: fit.width || undefined,
    marginInline: 'auto',
    // The margin sits on the zoomed block, so it is zoomed too.
    ...(fit.gutterPx ? { marginBottom: -fit.gutterPx / zoom } : null),
    ...(rendering ? { [SPRITE_RENDERING_VAR]: rendering } : null),
  };
}
