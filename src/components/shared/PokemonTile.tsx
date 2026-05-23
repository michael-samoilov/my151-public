import type { ReactNode } from 'react';
import { cn, displayName } from '@/lib/utils';
import { usePixelPerfectSprite, useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { BASE_DPR } from '@/lib/viewport';
import { useDebugSpriteScale } from '@/lib/debugSpriteScale';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { Pokemon, TypeName } from '@/types/pokemon';

/** Above this unzoomed viewport width the sprite IMG renders at 2× source
 *  resolution and the tile chrome (text, badges, padding) is boosted by
 *  WIDE_LAYOUT_BOOST. Narrower phones keep the 1× sprite to avoid heavy
 *  overlap with neighbouring tiles. */
const MOBILE_2X_MIN_PX = 375;

/** PokeAPI pixel-art sprite source resolution. */
const SPRITE_SOURCE_PX = 96;

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
 * Layout scale (the `--tile-sprite` CSS var) that every tile internal
 * (name text, type badges, gen badge, padding) is `calc()`-ed off.
 * Base is pixel-perfect mobile 11vw / desktop clamp(40px, 7vw, 96px).
 * On wide viewports (≥375px) it's boosted by WIDE_LAYOUT_BOOST so the
 * chrome stays proportional next to the doubled sprite IMG.
 */
export function useTileSpritePx(): number {
  const oneX = usePixelPerfectSprite(11, 40, 7, 96);
  const wide = useViewportAtLeast(MOBILE_2X_MIN_PX);
  // DEBUG: chromeBoost is live-tunable via the slider; defaults to
  // WIDE_LAYOUT_BOOST. Remove the store read before merging.
  const { chromeBoost } = useDebugSpriteScale();
  void WIDE_LAYOUT_BOOST;
  return wide ? Math.round(oneX * chromeBoost) : oneX;
}

/**
 * Width/height (CSS px) for the sprite `<img>` element. On viewports
 * ≥375px the IMG renders at exactly 2× the 96px source (192 device
 * pixels per side, BASE_DPR-compensated) for a crisp, larger pixel-art
 * sprite that overflows its grid column horizontally by design.
 * Narrower phones fall back to the 1× layout size to avoid heavy
 * overlap with neighbouring tiles.
 */
export function useTileImagePx(layoutPx: number): number {
  const wide = useViewportAtLeast(MOBILE_2X_MIN_PX);
  // DEBUG: imgScale is live-tunable via the slider; defaults to 2.0.
  // Remove the store read before merging.
  const { imgScale } = useDebugSpriteScale();
  if (!wide) return layoutPx;
  return Math.round((SPRITE_SOURCE_PX * imgScale) / BASE_DPR);
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
