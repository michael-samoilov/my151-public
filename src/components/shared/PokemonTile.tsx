import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import type { PokemonLabel } from '@/i18n/names';
import { PokemonName } from './PokemonName';
import { tileImageCssPx } from '@/lib/tileImage';
import { useFluidSpritePx, useLayoutViewportCssPx, useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { Pokemon, TypeName } from '@/types/pokemon';

const MOBILE_SPRITE_VW = 8.2;

const DESKTOP_PANE_DIVISOR = 2;

const SPRITE_IMG_SCALE = 1.95;

const WIDE_LAYOUT_BOOST = 1.4;

const SPRITE_NATIVE = 96;

export function useTileSpritePx(): number {
  const isDesktop = useViewportAtLeast(1024);
  const divisor = isDesktop ? DESKTOP_PANE_DIVISOR : 1;
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, divisor);
  const fluid = Math.round(oneX * WIDE_LAYOUT_BOOST);
  if (!isDesktop) return fluid;
  const fluidImage = oneX * SPRITE_IMG_SCALE;
  const multiple = Math.max(1, Math.floor(fluidImage / SPRITE_NATIVE));
  const imagePx = multiple * SPRITE_NATIVE;
  const cap = Math.round(imagePx * WIDE_LAYOUT_BOOST / SPRITE_IMG_SCALE);
  return Math.min(fluid, cap);
}

function useTileImagePx(): number {
  return tileImageCssPx(useLayoutViewportCssPx());
}

export function useTileGridMaxWidth(
  cols: number = 6,
  gapPx: number = 0,
  overheadPx: number = 0,
): number | undefined {
  const isDesktop = useViewportAtLeast(1024);
  const oneX = useFluidSpritePx(MOBILE_SPRITE_VW, 40, 7, 96, isDesktop ? DESKTOP_PANE_DIVISOR : 1);
  if (!isDesktop) return undefined;
  const fluidImage = oneX * SPRITE_IMG_SCALE;
  const multiple = Math.max(1, Math.floor(fluidImage / SPRITE_NATIVE));
  const imagePx = multiple * SPRITE_NATIVE;
  const targetCol = imagePx * 100 / (MOBILE_SPRITE_VW * SPRITE_IMG_SCALE * 6);
  return Math.round(cols * targetCol + Math.max(0, cols - 1) * gapPx + overheadPx);
}

export const TILE_ROOT_PADDING_CLASS =
  'pt-[calc(var(--tile-sprite)*0.045)] pb-[calc(var(--tile-sprite)*0.09)]';

export const TILE_GEN_BADGE_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] left-[calc(var(--tile-sprite)*0.05)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-10';

export const TILE_ACTION_BUTTON_CLASS =
  'absolute top-[calc(var(--tile-sprite)*0.05)] right-[calc(var(--tile-sprite)*0.05)] w-[calc(var(--tile-sprite)*0.28)] h-[calc(var(--tile-sprite)*0.28)] z-[15]';

interface PokemonTileContentProps {
  displayLabel?: PokemonLabel;
  pokemon: Pokemon;
  spriteUrl?: string;
  spriteStyle?: CSSProperties;
  /** Drawn over the sprite, positioned in the sprite's own box. */
  spriteOverlay?: ReactNode;
  contentClassName?: string;
  afterTypes?: ReactNode;
  imgLoading?: 'lazy' | 'eager';
}

export function PokemonTileContent({
  pokemon,
  displayLabel,
  spriteUrl,
  spriteStyle,
  spriteOverlay,
  contentClassName,
  afterTypes,
  imgLoading = 'lazy',
}: PokemonTileContentProps) {
  const imagePx = useTileImagePx();
  useNamesVersion();
  const label = displayLabel ?? pokemonLabel(pokemon.id, pokemon.name);
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
          position: spriteOverlay ? 'relative' : undefined,
        }}
      >
        <img
          src={spriteUrl ?? pokemon.sprite}
          alt={label.pending ? '' : label.full}
          width={imagePx}
          height={imagePx}
          loading={imgLoading}
          decoding="async"
          draggable={false}
          // Tailwind's reset constrains img to `max-width: 100%`; override
          // so the 2× sprite can overflow its narrower flex parent.
          style={{ imageRendering: 'pixelated', maxWidth: 'none', ...spriteStyle }}
        />
        {spriteOverlay}
      </div>
      <PokemonName label={label} className="w-full text-[calc(var(--tile-sprite)*0.18)] font-medium leading-tight" />
      <div className="flex flex-col items-center gap-[calc(var(--tile-sprite)*0.03)] mt-[calc(var(--tile-sprite)*0.045)] w-full">
        {pokemon.types.map((t) => (
          <TypeBadge key={t} type={t as TypeName} className="w-[min(var(--tile-sprite),100%)]" />
        ))}
        {pokemon.types.length === 1 && (
          <div className="w-[min(var(--tile-sprite),100%)]" style={{ aspectRatio: '200/40' }} aria-hidden />
        )}
      </div>
      {afterTypes}
    </div>
  );
}
