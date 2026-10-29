import type { CSSProperties } from 'react';
import { TYPE_BADGE, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';

/**
 * A toggle pill, shared by the Shiny switch and the Favorite Picker's Icons switch. Off, it looks like an
 * unselected filter pill. Its colors switch at once and hover darkens only the border: the on ink is
 * near-black, so a fade or a dark hover ink would show a pill just turned off as still on.
 */
export const PILL_CLASS = 'inline-flex shrink-0 cursor-pointer items-center gap-1 border text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
export const PILL_OFF = 'border-border bg-background text-muted-foreground hover:border-foreground/30';

/** A badge pill's corner radius in px. A filter pill is fully round. */
export const badgePillRadius = (badgePx: number) => (badgePx * TYPE_BADGE.radius) / TYPE_BADGE_H;

/**
 * Size and roundness. Given `badgePx`, the pill is as tall as the Favorite Picker's type and gen
 * badges and as round; otherwise it matches the browser's filter pills.
 */
export function pillStyle({ badgePx, iconOnly = false }: { badgePx?: number; iconOnly?: boolean }): CSSProperties {
  if (badgePx != null) {
    return { height: badgePx, borderRadius: badgePillRadius(badgePx), paddingInline: iconOnly ? 4 : 9 };
  }
  return { height: 'calc(1.25rem + 2px)', borderRadius: 9999, paddingInline: iconOnly ? '0.25rem' : '0.625rem' };
}

/** Badge pills sit in a px-sized header, so their icon stays 16 px; filter pills scale with the root font size. */
export const pillIcon = (badgePx?: number): { className?: string; style?: CSSProperties } =>
  badgePx != null ? { style: { width: 16, height: 16, flex: 'none' } } : { className: 'size-4 shrink-0' };
