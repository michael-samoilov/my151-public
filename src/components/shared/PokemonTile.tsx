import type { ReactNode } from 'react';
import { cn, displayName } from '@/lib/utils';
import { useFluidSpritePx, useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { Pokemon, TypeName } from '@/types/pokemon';

/** Base sprite scale, in vw of the tile's *container*. The chrome is this ×
 *  WIDE_LAYOUT_BOOST and the IMG is this × SPRITE_IMG_SCALE, so both grow
 *  smoothly with the container width. Calibrated so a 6-column grid renders
 *  the sprite at ~96% of its column width (e.g. a ~390px phone → ~45px
 *  chrome / ~62px sprite). On desktop every tile host is `md:w-1/2`, so the
 *  container is half the window (see DESKTOP_PANE_DIVISOR). */
const MOBILE_SPRITE_VW = 8.2;

/** On desktop (≥1024px) every tile host — the build page, the selection
 *  pane, and the analytics drill-down — is `md:w-1/2`. Sizing off half the
 *  window therefore matches each host's real width, so the same Pokemon
 *  renders identically across all of them, and a side pane of width W looks
 *  exactly like a mobile bottom sheet of width W. */
const DESKTOP_PANE_DIVISOR = 2;

/** Multiplier on the 1× base for the sprite IMG. 1.95× (just under a clean
 *  2×) makes the sprite nearly fill its grid column for a bold, readable
 *  tile while leaving a hair of breathing room before neighbours. */
const SPRITE_IMG_SCALE = 1.95;

/** Multiplier applied to the 1× base to get the layout scale (--tile-sprite).
 *  The IMG grows by SPRITE_IMG_SCALE; the chrome (text, badges, padding)
 *  grows by this smaller factor so labels stay proportional next to the
 *  bigger sprite without dominating. */
const WIDE_LAYOUT_BOOST = 1.4;

/**
 * Canonical tile primitives used by every "Pokemon tile" in the app —
 * selection browser (`EvoLineCard`), main build page (`DraggableTile`),
 * and drag overlay (`PokemonTileStatic`). Keeping the sprite formula,
 * padding, and per-fraction internal ratios in this single module is
 * what guarantees structural parity: the same Pokemon renders at the
 * same size, with the same gen-badge / name / type-badge proportions,
 * regardless of which tile host is drawing it.
 *
 * Adding a new tile host? Use `useTileSpritePx` for the sprite size,
 * wrap the host in `TILE_ROOT_PADDING_CLASS` (with `--tile-sprite` set
 * inline), and render `<PokemonTileContent>` for the sprite/name/types.
 * Overlays (gen badge, action buttons) should use the shared class
 * constants below so their position and size can't drift either.
 */

/**
 * Effective viewport divisor for the current layout. On desktop every tile
 * host is `md:w-1/2`, so we size off half the window; on mobile the host
 * fills the viewport, so we size off the whole width. Sizing off the host's
 * real width is what makes the build page, selection pane, and analytics
 * drill-down all render the same Pokemon at the same size, and makes a side
 * pane of width W look identical to a mobile bottom sheet of width W.
 */
function useTileDivisor(): number {
  const isDesktop = useViewportAtLeast(1024);
  return isDesktop ? DESKTOP_PANE_DIVISOR : 1;
}

/**
 * Layout scale (the `--tile-sprite` CSS var) that every tile internal
 * (name text, type badges, gen badge, padding) is `calc()`-ed off. It's the
 * fluid 1× base × WIDE_LAYOUT_BOOST, so the chrome scales smoothly with the
 * container width and stays proportional next to the larger sprite IMG.
 */
export function useTileSpritePx(): number {
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, useTileDivisor());
  return Math.round(oneX * WIDE_LAYOUT_BOOST);
}

/**
 * Width/height (CSS px) for the sprite `<img>` element: the fluid 1× base ×
 * SPRITE_IMG_SCALE. It's larger than the chrome footprint (--tile-sprite)
 * so the sprite nearly fills — and slightly overflows — its grid column by
 * design. Because both this and the chrome derive from the same
 * container-relative base, the sprite-to-tile proportions are identical at
 * every width and across every tile host.
 */
function useTileImagePx(): number {
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, useTileDivisor());
  return Math.round(oneX * SPRITE_IMG_SCALE);
}

/** Root-padding ratios, shared across tile hosts. */
export const TILE_ROOT_PADDING_CLASS =
  'pt-[calc(var(--tile-sprite)*0.045)] pb-[calc(var(--tile-sprite)*0.09)]';

/** Positioning + size for the gen badge overlay (generation indicator).
 *  Sits flush in the top-left corner (0.05 offset) so it stays clear of
 *  the now-larger sprite that may render behind it. */
export const TILE_GEN_BADGE_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] left-[calc(var(--tile-sprite)*0.05)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-10';

/** Positioning + size for action-button overlays (X / pokeball / plus).
 *  Mirrors the gen badge: same top/right padding (0.05), same size. */
export const TILE_ACTION_BUTTON_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] right-[calc(var(--tile-sprite)*0.05)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-[15]';

interface PokemonTileContentProps {
  pokemon: Pokemon;
  /** Override the sprite URL (shiny variants, regional art overrides). */
  spriteUrl?: string;
  /** Extra classes for the flex column wrapping sprite + name + types.
   *  Used for de-emphasis states (e.g. `opacity-35`). */
  contentClassName?: string;
  /** Rendered inside the content wrapper after the type badges — e.g.
   *  matchup info in analytics drill-downs. */
  afterTypes?: ReactNode;
  /** Image loading strategy. Default "lazy" defers off-screen loads; use
   *  "eager" in contexts like carousels where off-screen panels must
   *  preload sprites to avoid a blank→load flicker on swipe. */
  imgLoading?: 'lazy' | 'eager';
  /** Show form-variant suffix for base forms with exclusive alternatives. */
  showFormVariant?: boolean;
}

/**
 * Renders the canonical sprite + name + type-badge block for a Pokemon
 * tile. All proportions (text size, type-badge width, inter-type gap,
 * name/type gap) are driven off `--tile-sprite`, which must be set on
 * an ancestor element. The root `--tile-sprite` is typically set by
 * the caller alongside `TILE_ROOT_PADDING_CLASS`.
 */
export function PokemonTileContent({
  pokemon,
  spriteUrl,
  contentClassName,
  afterTypes,
  imgLoading = 'lazy',
  showFormVariant = false,
}: PokemonTileContentProps) {
  // The IMG is larger than its layout footprint (--tile-sprite), so it
  // nearly fills and slightly overflows the grid column, centered. The well
  // is a fixed imagePx square so the bottom-aligned sprite has a stable box
  // regardless of the column width.
  const imagePx = useTileImagePx();
  return (
    <div className={cn('flex flex-col items-center w-full', contentClassName)}>
      {/*
        Native lazy-loaded <img> rather than a CSS background-image on a
        <div>. CSS backgrounds bypass `loading="lazy"` and fire off all
        ~151 sprite requests on initial paint, swamping the browser's
        request queue and starving the lazy type-badge <img>s behind them
        (the symptom: type badges load long after sprites on desktop).
        With <img loading="lazy">, only tiles near the viewport request
        their sprite at first paint; off-screen tiles defer until scrolled
        into view.
      */}
      <div
        style={{
          width: `${imagePx}px`,
          height: `${imagePx}px`,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <img
          src={spriteUrl ?? pokemon.sprite}
          alt={pokemon.name}
          width={imagePx}
          height={imagePx}
          loading={imgLoading}
          decoding="async"
          draggable={false}
          // Tailwind's reset constrains img to `max-width: 100%`; override
          // so the 2× sprite can overflow its narrower flex parent.
          style={{ imageRendering: 'pixelated', maxWidth: 'none' }}
        />
      </div>
      <span className="text-[calc(var(--tile-sprite)*0.18)] font-medium capitalize truncate text-center leading-tight w-full px-[calc(var(--tile-sprite)*0.045)]">
        {displayName(pokemon.name, showFormVariant)}
      </span>
      <div className="flex flex-col items-center gap-[calc(var(--tile-sprite)*0.03)] mt-[calc(var(--tile-sprite)*0.045)] w-full">
        {pokemon.types.map((t) => (
          <TypeBadge key={t} type={t as TypeName} className="w-[var(--tile-sprite)]" loading={imgLoading} />
        ))}
        {pokemon.types.length === 1 && (
          <div className="w-[var(--tile-sprite)]" style={{ aspectRatio: '200/40' }} aria-hidden />
        )}
      </div>
      {afterTypes}
    </div>
  );
}
