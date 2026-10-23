import { createContext } from 'react';
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import { SLOT_COUNT } from './model/constants';

const ROW_REM = 2.75;
export const HOME_SPRITE_REM = 2.625;
const BAND_REM = 1.25;
const TIGHT_BAND_REM = 0.875;
const PAD_REM = 0.6875;
const TIGHT_PAD_REM = 0.25;
const GAP_PX = 1;
const SECTIONS = 4;
const HINT_LINE_REM = 0.625 * 1.35;
const HINT_GAP_REM = 0.125;
const HINT_PAD_REM = 0.5;

const MAX_TRIM_PX = 6;

interface HomeLayout {
  trimPx: number;
  spacing: number;
  hints: 0 | 1 | 2;
}

const ROOMY: HomeLayout = { trimPx: 0, spacing: 1, hints: 2 };
const TIGHTEST: HomeLayout = { trimPx: MAX_TRIM_PX, spacing: 0, hints: 0 };

interface Stage {
  name: string;
  relax: (layout: HomeLayout, t: number) => HomeLayout;
  partial: boolean;
}

const HOME_STAGES: readonly Stage[] = [
  { name: 'sprite box', partial: true, relax: (l, t) => ({ ...l, trimPx: MAX_TRIM_PX * (1 - t) }) },
  { name: 'spacing', partial: true, relax: (l, t) => ({ ...l, spacing: t }) },
  { name: 'one hint line', partial: false, relax: (l) => ({ ...l, hints: 1 }) },
  { name: 'both hint lines', partial: false, relax: (l) => ({ ...l, hints: 2 }) },
];

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

interface HomeMetrics {
  rowRem: number;
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

export function homeHeightRem(layout: HomeLayout, rootPx: number): number {
  const m = homeMetrics(layout);
  const hints = m.hints === 0 ? 0 : m.hints === 1 ? HINT_LINE_REM : 2 * HINT_LINE_REM + HINT_GAP_REM;
  return 2 * m.padRem + SLOT_COUNT * m.rowRem + SECTIONS * m.bandRem
    + ((SECTIONS - 1) * m.gapPx) / rootPx + m.hintPadRem + hints;
}

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

export const HomeMetricsContext = createContext<HomeMetrics>(homeMetrics(ROOMY));
