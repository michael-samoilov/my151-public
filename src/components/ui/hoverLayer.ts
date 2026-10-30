import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * The hover state of a control that is on: its own fill, deeper. The control names that fill in
 * `--fill` (see `fillVar`). On hover, a layer behind its content draws it 0.035 darker in OKLCH
 * lightness and more colourful by 60% or 0.03 of chroma, whichever is less, with the same hue.
 * Black or the text colour laid over the fill turned light fills grey. Tailwind's `hover:` applies
 * only where the pointer can hover, so a tap never leaves it showing. A control with no `--fill`
 * shows no hover.
 */
export const HOVER_LAYER = cn(
  'relative isolate',
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
  'before:[background-color:oklch(from_var(--fill)_calc(l_-_0.035)_min(calc(c_*_1.6),calc(c_+_0.03))_h)]',
  'before:opacity-0 hover:before:opacity-100',
);

/** The `--fill` that `HOVER_LAYER` deepens. */
export const fillVar = (fill: string): CSSProperties => ({ ['--fill' as string]: fill });
