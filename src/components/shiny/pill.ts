import type { CSSProperties } from 'react';
import { TYPE_BADGE, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';

/** A toggle pill, shared by the Shiny switch and the Favorite Picker's Icons switch. Off, it looks like an unselected filter pill. */
export const PILL_CLASS = 'inline-flex shrink-0 cursor-pointer items-center gap-1 border text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const PILL_OFF = 'border-border bg-background text-muted-foreground hover:text-foreground';

/**
 * Size and roundness. Given `badgePx`, the pill is as tall as the Favorite Picker's type and gen
 * badges and as round; otherwise it matches the browser's filter pills. `thick` takes 0.5 px of
 * padding for the 1.5 px holo border, so switching on never moves the row.
 */
export function pillStyle({ badgePx, thick = false, iconOnly = false }: { badgePx?: number; thick?: boolean; iconOnly?: boolean }): CSSProperties {
  const less = thick ? ' - 0.5px' : '';
  if (badgePx != null) {
    return { height: badgePx, borderRadius: (badgePx * TYPE_BADGE.radius) / TYPE_BADGE_H, paddingInline: `calc(${iconOnly ? 4 : 9}px${less})` };
  }
  return { height: 'calc(1.25rem + 2px)', borderRadius: 9999, paddingInline: `calc(${iconOnly ? '0.25rem' : '0.625rem'}${less})` };
}

/** Badge pills sit in a px-sized header, so their icon stays 16 px; filter pills scale with the root font size. */
export const pillIcon = (badgePx?: number): { className?: string; style?: CSSProperties } =>
  badgePx != null ? { style: { width: 16, height: 16, flex: 'none' } } : { className: 'size-4 shrink-0' };
