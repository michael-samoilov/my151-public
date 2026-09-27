import { createContext } from 'react';
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import { SLOT_COUNT } from './model/constants';

/**
 * The league summary's vertical layout, and the order it spends height in.
 *
 * On a Retina desktop the summary holds its sprites at exactly 1x
 * (`spriteScale.ts`), so the zoom cannot shrink to fit a short window. The
 * summary's own spacing gives way instead. It starts from its tightest
 * layout and spends the window's spare height on these stages, in order:
 *
 * 1. The sprite box. At its tightest a row reserves the sprite minus
 *    `MAX_TRIM_PX` source px on each side, and the image hangs over the row's
 *    edges. That is what 90% of the sprites leave empty anyway, but a tall
 *    creature can still reach into a section band. Un-trimming comes first
 *    so no sprite does.
 * 2. The spacing: the row's slack around its sprite, the section bands, the
 *    gaps between them, and the card's padding.
 * 3. One hint line under the list, then the second one.
 *
 * Every other screen uses `ROOMY`, today's layout, and every screen gets
 * `ROOMY` once its window has the room for it.
 *
 * All sizes are rem at zoom 1. The markup reads them from `homeMetrics`, and
 * `homeHeightRem` adds up the same numbers, so the fit and the paint cannot
 * disagree.
 */

/** A row's height with today's spacing: 44px at a 16px root. */
const ROW_REM = 2.75;
/**
 * Sprite size. The gym card draws its sprites at 96% of its row height and
 * lets them overhang the cell, and that overhang is what makes a sprite read
 * as a creature rather than an icon, so the summary takes the same share.
 */
export const HOME_SPRITE_REM = 2.625;
/** The section bands, today and at their tightest. */
const BAND_REM = 1.25;
const TIGHT_BAND_REM = 0.875;
/** The card's padding, today and at its tightest. */
const PAD_REM = 0.6875;
const TIGHT_PAD_REM = 0.25;
/** The line above every section band but the first. */
const GAP_PX = 1;
const SECTIONS = 4;
/** The hint text: a 0.625rem face on a 1.35 line. */
const HINT_LINE_REM = 0.625 * 1.35;
const HINT_GAP_REM = 0.125;
const HINT_PAD_REM = 0.5;

/**
 * The most the sprite box gives up on each side, in source px. 90% of the
 * 1,227 sprites leave at least this much empty above and below the creature.
 */
export const MAX_TRIM_PX = 6;

export interface HomeLayout {
  /** Source px the sprite box gives up on each side. */
  trimPx: number;
  /** How much of today's spacing is kept: 0 is the tightest, 1 today's. */
  spacing: number;
  /** Hint lines under the list: none, both said in one, or today's two. */
  hints: 0 | 1 | 2;
}

export const ROOMY: HomeLayout = { trimPx: 0, spacing: 1, hints: 2 };
export const TIGHTEST: HomeLayout = { trimPx: MAX_TRIM_PX, spacing: 0, hints: 0 };

interface Stage {
  /** What the stage gives back, for a reader of the list. */
  name: string;
  /** The layout with `t` of this stage given back: 0 none, 1 all of it. */
  relax: (layout: HomeLayout, t: number) => HomeLayout;
  /** False for a stage that is all or nothing, like a line of text. */
  partial: boolean;
}

/** Where spare height goes, first to last. Each stage starts from `TIGHTEST`. */
export const HOME_STAGES: readonly Stage[] = [
  { name: 'sprite box', partial: true, relax: (l, t) => ({ ...l, trimPx: MAX_TRIM_PX * (1 - t) }) },
  { name: 'spacing', partial: true, relax: (l, t) => ({ ...l, spacing: t }) },
  { name: 'one hint line', partial: false, relax: (l) => ({ ...l, hints: 1 }) },
  { name: 'both hint lines', partial: false, relax: (l) => ({ ...l, hints: 2 }) },
];

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** The sizes the markup draws a layout at, in rem at zoom 1. */
export interface HomeMetrics {
  rowRem: number;
  /** How far the sprite hangs past its box on each side. */
  trimRem: number;
  bandRem: number;
  gapPx: number;
  padRem: number;
  hintPadRem: number;
  hints: HomeLayout['hints'];
}

export function homeMetrics(layout: HomeLayout): HomeMetrics {
  const trimRem = (layout.trimPx / SPRITE_NATIVE) * HOME_SPRITE_REM;
  return {
    rowRem: HOME_SPRITE_REM - 2 * trimRem + (ROW_REM - HOME_SPRITE_REM) * layout.spacing,
    trimRem,
    bandRem: lerp(TIGHT_BAND_REM, BAND_REM, layout.spacing),
    gapPx: GAP_PX * layout.spacing,
    padRem: lerp(TIGHT_PAD_REM, PAD_REM, layout.spacing),
    hintPadRem: layout.hints === 0 ? 0 : HINT_PAD_REM,
    hints: layout.hints,
  };
}

/** The summary's height at zoom 1, in rem: the card, then its hint lines. */
export function homeHeightRem(layout: HomeLayout, rootPx: number): number {
  const m = homeMetrics(layout);
  const hints = m.hints === 0 ? 0 : m.hints === 1 ? HINT_LINE_REM : 2 * HINT_LINE_REM + HINT_GAP_REM;
  return 2 * m.padRem + SLOT_COUNT * m.rowRem + SECTIONS * m.bandRem
    + ((SECTIONS - 1) * m.gapPx) / rootPx + m.hintPadRem + hints;
}

/**
 * The roomiest layout that fits `budgetRem`, spending it stage by stage.
 * A budget under the tightest layout gets the tightest layout, and the fit's
 * zoom is what makes that one fit.
 */
export function fitHomeLayout(budgetRem: number, rootPx: number): HomeLayout {
  let layout = TIGHTEST;
  for (const stage of HOME_STAGES) {
    const whole = stage.relax(layout, 1);
    const need = homeHeightRem(whole, rootPx);
    if (need <= budgetRem) {
      layout = whole;
      continue;
    }
    if (stage.partial) {
      const from = homeHeightRem(layout, rootPx);
      layout = stage.relax(layout, Math.max(0, (budgetRem - from) / (need - from)));
    }
    break;
  }
  return layout;
}

/** The layout the summary's rows draw at. Outside a provider: today's. */
export const HomeMetricsContext = createContext<HomeMetrics>(homeMetrics(ROOMY));
