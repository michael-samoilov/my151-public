import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SHAPE_NAMES, type ShapeName } from '@/types/pokemon';

/** Size multiplier for the silhouette-in-circle icons (chart column + shape
 *  drilldown header/nav) — tuned to read well against the labels/sprites. */
export const SHAPE_ICON_SCALE = 1.65;

/**
 * The official Pokémon HOME body-shape icons (the 14 silhouettes used by the
 * games' shape search), served from public/shapes/<shape>.png. They're black
 * silhouettes on transparent, so `dark:invert` flips them to white in dark mode
 * for legibility — no other color treatment is applied (they render exactly as
 * the source art in light mode).
 */


export const SHAPE_ORDER: readonly ShapeName[] = SHAPE_NAMES;

export const shapeIconPath = (shape: ShapeName | string) => `/shapes/${shape}.png`;

/** <img> for HTML contexts (filter sheet buttons, chips). */
export function ShapeIcon({ shape, className }: { shape: ShapeName; className?: string }) {
  return (
    <img
      src={shapeIconPath(shape)}
      alt=""
      aria-hidden
      className={cn('object-contain dark:invert', className)}
    />
  );
}

/** Silhouette-in-circle variant: the shape sits inside a bordered disc (like the
 *  official HOME shape-search icons). `size` is the base diameter in px (scaled by
 *  SHAPE_ICON_SCALE); the silhouette fills ~70% of it. Used in the shape drilldown
 *  header / nav for a consistent badge look with the chart. */
export function ShapeIconCircle({ shape, size = 20, className }: { shape: ShapeName; size?: number; className?: string }) {
  const px = size * SHAPE_ICON_SCALE;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-border bg-background shrink-0',
        className,
      )}
      style={{ width: px, height: px }}
    >
      <ShapeIcon shape={shape} className="w-[70%] h-[70%]" />
    </span>
  );
}

/** Renderer for ButterflyChart's icon slot: the silhouette-in-circle badge as an
 *  SVG group — a bordered disc (background fill + border stroke) with the sprite
 *  centered inside, dark-mode-inverted like the HTML variant. Matches the
 *  ShapeIconCircle look used in the drilldown. */
export function shapeChartIcon(shape: ShapeName) {
  return function render(x: number, y: number, size: number, colWidth = size): ReactNode {
    // Square icon, centred in a column that may be wider than it is.
    x += (colWidth - size) / 2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const pad = size * 0.16; // inner silhouette fills ~68% of the disc
    return (
      <g key={`shape-icon-${shape}`}>
        <circle
          cx={cx}
          cy={cy}
          r={size / 2 - 0.5}
          fill="var(--color-background)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        <image
          href={shapeIconPath(shape)}
          x={x + pad}
          y={y + pad}
          width={size - 2 * pad}
          height={size - 2 * pad}
          preserveAspectRatio="xMidYMid meet"
          className="dark:invert"
        />
      </g>
    );
  };
}
