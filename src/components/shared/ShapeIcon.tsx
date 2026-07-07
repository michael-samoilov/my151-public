import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SHAPE_NAMES, type ShapeName } from '@/types/pokemon';

/**
 * The official Pokémon HOME body-shape icons (the 14 silhouettes used by the
 * games' shape search), served from public/shapes/<shape>.png. They're black
 * silhouettes on transparent, so `dark:invert` flips them to white in dark mode
 * for legibility — no other color treatment is applied (they render exactly as
 * the source art in light mode).
 */

export const SHAPE_LABELS: Record<ShapeName, string> = {
  ball: 'Head',
  squiggle: 'Serpent',
  fish: 'Fins',
  arms: 'Head & Arms',
  blob: 'Head & Base',
  upright: 'Biped, Tail',
  legs: 'Head & Legs',
  quadruped: 'Quadruped',
  wings: 'Winged',
  tentacles: 'Tentacles',
  heads: 'Multi-Body',
  humanoid: 'Humanoid',
  'bug-wings': 'Insect Wings',
  armor: 'Insectoid',
};

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

/** Renderer for ButterflyChart's icon slot: an SVG <image> of the sprite,
 *  positioned at (x, y) in a size×size box, dark-mode-inverted like the HTML
 *  variant. No tinting — the shape art stands on its own. */
export function shapeChartIcon(shape: ShapeName) {
  return function render(x: number, y: number, size: number): ReactNode {
    return (
      <image
        key={`shape-icon-${shape}`}
        href={shapeIconPath(shape)}
        x={x}
        y={y}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
        className="dark:invert"
      />
    );
  };
}
