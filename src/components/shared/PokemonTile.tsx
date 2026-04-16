import type { ReactNode } from 'react';
import { cn, displayName } from '@/lib/utils';
import { usePixelPerfectSprite } from '@/lib/usePixelPerfectSprite';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { Pokemon, TypeName } from '@/types/pokemon';

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
 * Pixel-perfect sprite size for every Pokemon tile. Mobile 11vw,
 * desktop `clamp(40px, 7vw, 96px)`; see `usePixelPerfectSprite` for
 * the snap-to-integer-multiple rationale.
 */
export function useTileSpritePx(): number {
  return usePixelPerfectSprite(11, 40, 7, 96);
}

/** Root-padding ratios, shared across tile hosts. */
export const TILE_ROOT_PADDING_CLASS =
  'pt-[calc(var(--tile-sprite)*0.045)] pb-[calc(var(--tile-sprite)*0.09)]';

/** Positioning + size for the gen badge overlay (generation indicator).
 *  Mirrors the action-button class on the opposite corner — same top
 *  offset, same size, and a left offset equal to the action button's
 *  right offset — so gen badge and pokeball/X render as visual siblings. */
export const TILE_GEN_BADGE_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] left-[calc(var(--tile-sprite)*0.14)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-10';

/** Positioning + size for action-button overlays (X / pokeball / plus). */
export const TILE_ACTION_BUTTON_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] right-[calc(var(--tile-sprite)*0.14)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-[15]';

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
        into view. width/height attrs match spritePx so the layout is
        stable and matches the prior background-size snap behavior.
      */}
      <img
        src={spriteUrl ?? pokemon.sprite}
        alt={pokemon.name}
        width={spritePx}
        height={spritePx}
        loading={imgLoading}
        decoding="async"
        draggable={false}
        style={{ imageRendering: 'pixelated' }}
      />
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
