import type { ReactNode } from 'react';
import { SHAPE_NAMES, type ShapeName } from '@/types/pokemon';

/**
 * Stylized glyphs for the 14 official dex body-shape groups (the icons the
 * games/HOME use for the shape search). Drawn as simple currentColor
 * silhouettes in a 24×24 box so they inherit text color and scale crisply
 * anywhere (filter sheet buttons, chips, chart rows).
 *
 * Order and identifiers follow the canonical shape ids (see SHAPE_NAMES).
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

/** Raw glyph nodes (no <svg> wrapper) for embedding inside larger SVGs. */
export function shapeGlyph(shape: ShapeName): ReactNode {
  switch (shape) {
    case 'ball': // just a head (Voltorb, Jigglypuff)
      return <circle cx="12" cy="12" r="8.5" />;
    case 'squiggle': // serpentine body (Ekans, Dratini)
      return (
        <path
          d="M5 19c4.5 0 5-3.5 2.8-5C5.6 12.4 5.4 8 9.5 6.6 13.5 5.2 17 7 18 10"
          fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"
        />
      );
    case 'fish': // finned body (Magikarp)
      return (
        <path d="M3.5 12c2.5-4 6.5-6 10-6 3 0 5.5 2.5 6.5 6-1 3.5-3.5 6-6.5 6-3.5 0-7.5-2-10-6zm12.5 0l5-5v10l-5-5z" />
      );
    case 'arms': // head + arms, no legs (Grimer, Haunter)
      return (
        <path d="M12 4a6 6 0 016 6v7a2 2 0 01-4 0v-2h-4v2a2 2 0 01-4 0v-7a6 6 0 016-6zM3 10.5A2.5 2.5 0 015.5 8H7v5H5.5A2.5 2.5 0 013 10.5zm18 0A2.5 2.5 0 0018.5 8H17v5h1.5a2.5 2.5 0 002.5-2.5z" />
      );
    case 'blob': // head + base (Snorlax, Ditto mound)
      return <path d="M12 4c4 0 7 2.8 7 6.5 0 1.6-.6 3-1.6 4.1 1.4.7 2.3 1.7 2.3 3.4H4.3c0-1.7.9-2.7 2.3-3.4A6.1 6.1 0 015 10.5C5 6.8 8 4 12 4z" />;
    case 'upright': // bipedal with tail (Charmander, Kangaskhan)
      return <path d="M10 4.5A3.5 3.5 0 0113.5 8v1.2c1.8.9 3 2.7 3 4.8v3a3 3 0 01-.4 1.5l2.9-.3c1.5-.2 2.4-1.4 2.4-3h1.5c0 2.6-1.7 4.4-4.4 4.8l-4 .5H9.5A3.5 3.5 0 016 17v-4a5.5 5.5 0 014-5.3V8a3.5 3.5 0 010-3.5z" />;
    case 'legs': // head + legs (Hitmonlee vibes)
      return <path d="M12 3.5a5 5 0 015 5c0 1.9-1 3.5-2.6 4.3l1.6 6.4a1.8 1.8 0 11-3.5.9L11.2 14h-.4l-1.3 6.1a1.8 1.8 0 11-3.5-.9L7.6 13A5 5 0 0112 3.5z" />;
    case 'quadruped': // four-legged side profile (Bulbasaur)
      return <path d="M17.5 7.5c2 0 3.5 1.5 3.5 3.5l-1.5.5v1l-1 .5.5 5h-2.5l-.5-4h-6l-.5 4H7l.5-4.7C6 12.7 5 11.4 5 10c0-2.5 2.5-4 6-4h4c.8 0 1.7.5 2.5 1.5z" />;
    case 'wings': // winged (Zubat, Pidgeot)
      return <path d="M12 13c-1.5-3.5-4.5-5.5-9-5.5 1.5 3 4 5 6.5 5.8L4 17l7-1.5c.4.9.7 1.9 1 3 .3-1.1.6-2.1 1-3L20 17l-5.5-3.7c2.5-.8 5-2.8 6.5-5.8-4.5 0-7.5 2-9 5.5z" />;
    case 'tentacles': // dome + tentacles (Tentacool)
      return <path d="M12 3.5c3.6 0 6.5 2.6 6.5 6H5.5c0-3.4 2.9-6 6.5-6zM6.5 11h2l-.6 5.5a1.6 1.6 0 11-3.1-.4L6.5 11zm9 0h2l1.7 5.1a1.6 1.6 0 11-3.1.4L15.5 11zm-4.6 0h2.2l.4 7a1.5 1.5 0 11-3 0l.4-7z" />;
    case 'heads': // multiple bodies/heads (Dugtrio, Magneton)
      return (
        <g>
          <circle cx="7" cy="14.5" r="4.5" />
          <circle cx="17" cy="14.5" r="4.5" />
          <circle cx="12" cy="7.5" r="4.5" />
        </g>
      );
    case 'humanoid': // bipedal tailless (Machamp)
      return <path d="M12 3a2.7 2.7 0 110 5.4A2.7 2.7 0 0112 3zM7 9.5h10a1.5 1.5 0 010 3h-2.2l1.7 7a1.6 1.6 0 11-3.1.7L12.3 15h-.6l-1.1 5.2a1.6 1.6 0 11-3.1-.7l1.7-7H7a1.5 1.5 0 010-3z" />;
    case 'bug-wings': // insect with wings (Butterfree)
      return <path d="M11 12a5.7 5.7 0 00-8-5c.6 2.8 2.3 4.7 5 5-2.7.3-4.4 2.2-5 5a5.7 5.7 0 008-5zm2 0a5.7 5.7 0 018-5c-.6 2.8-2.3 4.7-5 5 2.7.3 4.4 2.2 5 5a5.7 5.7 0 01-8-5zm-2.2-1h2.4l-.4 8.5a.8.8 0 01-1.6 0L10.8 11z" />;
    case 'armor': // armored insectoid (Kabutops, Scyther)
      return <path d="M12 3l7 4v6.5c0 3.6-2.9 6.7-7 7.5-4.1-.8-7-3.9-7-7.5V7l7-4zm0 3.2L8 8.4v4.8c0 2.2 1.6 4.2 4 4.9 2.4-.7 4-2.7 4-4.9V8.4l-4-2.2z" />;
    default:
      return <circle cx="12" cy="12" r="8" />;
  }
}

export function ShapeIcon({ shape, className }: { shape: ShapeName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      {shapeGlyph(shape)}
    </svg>
  );
}

/** Renderer for ButterflyChart's icon slot: positions the glyph inside the
 *  chart's own SVG at (x, y) in a size×size box. */
export function shapeChartIcon(shape: ShapeName, color?: string) {
  return function render(x: number, y: number, size: number): ReactNode {
    return (
      <g
        key={`shape-icon-${shape}`}
        transform={`translate(${x}, ${y}) scale(${size / 24})`}
        fill={color ?? 'currentColor'}
        color={color ?? 'currentColor'}
      >
        {shapeGlyph(shape)}
      </g>
    );
  };
}
