import type { ReactNode } from 'react';
import { cn, displayName } from '@/lib/utils';
import { useFluidSpritePx, useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { BASE_DPR } from '@/lib/viewport';
import { usePokedexStore } from '@/store/usePokedexStore';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { Pokemon, TypeName } from '@/types/pokemon';

/** Mobile (<1024px) base sprite scale, in vw. The chrome is this × the
 *  WIDE_LAYOUT_BOOST and the IMG is this × SPRITE_IMG_SCALE, so both grow
 *  smoothly with viewport width. Calibrated so a ~390px phone lands at the
 *  tuned 1× base of ~32px (→ 45px chrome / 62px sprite). */
const MOBILE_SPRITE_VW = 8.2;

/** PokeAPI pixel-art sprite source resolution. */
const SPRITE_SOURCE_PX = 96;

/** Multiplier on the source resolution for the sprite IMG on wide
 *  viewports. 1.95× (just under a clean 2×) trades a touch of pixel-art
 *  crispness for noticeably less overlap with neighbouring tiles. */
const SPRITE_IMG_SCALE = 1.95;

/** Multiplier applied to the 1× layout scale (--tile-sprite) on wide
 *  viewports. The IMG itself doubles (2× source); the chrome grows by
 *  this smaller factor so labels stay proportional next to the bigger
 *  sprite without dominating. */
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
 * True when the app is in its desktop split-pane layout — the build view
 * with a section selected (browser panel on the right), or analytics
 * with a drilldown panel open. In that state every visible pane is
 * `md:w-1/2`, so tile sizing must use half the window width to avoid
 * sprites overflowing their (now narrower) columns and overlapping.
 * Mobile sheets cover the whole viewport, so this returns false there.
 */
function useIsHalfPaneDesktop(): boolean {
  const isDesktop = useViewportAtLeast(1024);
  const activeSection = usePokedexStore((s) => s.activeSection);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  return isDesktop && (activeSection !== null || drillDownSegment !== null);
}

/**
 * Layout scale (the `--tile-sprite` CSS var) that every tile internal
 * (name text, type badges, gen badge, padding) is `calc()`-ed off.
 * Base (1×) is a fluid mobile MOBILE_SPRITE_VW / desktop clamp(40px, 7vw,
 * 96px) that interpolates continuously with width. It's boosted by
 * WIDE_LAYOUT_BOOST so the chrome stays proportional next to the larger
 * sprite IMG.
 *
 * In the desktop split-pane layout we size off half the window (each
 * pane is `md:w-1/2`) and skip the chrome boost — otherwise the bigger
 * sprite + boosted labels overflow the narrower 6-column grid and
 * overlap their neighbours.
 */
export function useTileSpritePx(): number {
  const halfPane = useIsHalfPaneDesktop();
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, halfPane ? 2 : 1);
  if (halfPane) return oneX;
  return Math.round(oneX * WIDE_LAYOUT_BOOST);
}

/**
 * Width/height (CSS px) for the sprite `<img>` element.
 *
 * On the mobile layout the IMG is the fluid 1× scale × SPRITE_IMG_SCALE,
 * so it grows smoothly with width and renders the same CSS size on every
 * device — a desktop window shrunk below the breakpoint matches the phone.
 * The sprite overflows its grid column horizontally by design.
 *
 * In the desktop split-pane layout the columns are halved, so the overflow
 * scaling would make sprites overlap; render the IMG at its layout
 * footprint instead. The full-desktop (≥1024) path renders at
 * SPRITE_IMG_SCALE × the 96px source, BASE_DPR-compensated for crisp
 * rendering at the device grid.
 */
export function useTileImagePx(layoutPx: number): number {
  const halfPane = useIsHalfPaneDesktop();
  const isDesktop = useViewportAtLeast(1024);
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, 1);
  if (halfPane) return layoutPx;
  if (!isDesktop) return Math.round(oneX * SPRITE_IMG_SCALE);
  return Math.round((SPRITE_SOURCE_PX * SPRITE_IMG_SCALE) / BASE_DPR);
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
  spritePx: number;
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
  spritePx,
  spriteUrl,
  contentClassName,
  afterTypes,
  imgLoading = 'lazy',
}: PokemonTileContentProps) {
  // On wide viewports the IMG renders at 2× the 96px source, which is
  // larger than its layout footprint (spritePx) — it overflows the grid
  // column horizontally, centered. The well is a fixed imagePx square so
  // the bottom-aligned sprite has a stable box regardless of the column.
  const imagePx = useTileImagePx(spritePx);
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
        {displayName(pokemon.name)}
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
