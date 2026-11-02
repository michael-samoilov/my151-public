import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

// platform: Tailwind hover: applies only where the pointer can hover, so a tap never leaves the layer showing.
export const HOVER_LAYER = cn(
  'relative isolate',
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:content-['']",
  'before:[background-color:oklch(from_var(--fill)_calc(l_-_0.035)_min(calc(c_*_1.6),calc(c_+_0.03))_h)]',
  'before:opacity-0 hover:before:opacity-100',
);

export const fillVar = (fill: string): CSSProperties => ({ ['--fill' as string]: fill });
