import { useRef, useState, useEffect, useCallback } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { TYPE_COLORS } from '@/data/type-colors';
import type { Pokemon, TypeName } from '@/types/pokemon';

const COLS = 10;
const ROWS = 16; // ceil(151 / 10)

const SORT_OPTIONS: { value: ViewSortOption; label: string }[] = [
  { value: 'regional', label: 'Regional Dex' },
  { value: 'national', label: 'National Dex' },
  { value: 'type', label: 'Type' },
  { value: 'build-order', label: 'Build Order' },
];

/** Pokeball SVG background with top/bottom halves colored by type, gap between halves. */
function PokeballBg({ pokemon }: { pokemon: Pokemon }) {
  const primary = TYPE_COLORS[pokemon.types[0] as TypeName];
  const secondary = TYPE_COLORS[(pokemon.types[1] ?? pokemon.types[0]) as TypeName];

  return (
    <>
      {/* Colored fills at reduced opacity */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full opacity-25 -rotate-45"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2 C10.06 2 2 10.06 2 20 L15 20 A5 5 0 0 1 25 20 L38 20 C38 10.06 29.94 2 20 2 Z"
          fill={primary}
        />
        <path
          d="M15 20 A5 5 0 0 0 25 20 L38 20 C38 29.94 29.94 38 20 38 C10.06 38 2 29.94 2 20 L15 20 Z"
          fill={secondary}
        />
      </svg>
      {/* Gap strokes at full opacity to cleanly separate halves */}
      <svg
        viewBox="0 0 40 40"
        className="absolute inset-0 w-full h-full -rotate-45"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 2 C10.06 2 2 10.06 2 20 L15 20 A5 5 0 0 1 25 20 L38 20 C38 10.06 29.94 2 20 2 Z"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="3"
        />
        <path
          d="M15 20 A5 5 0 0 0 25 20 L38 20 C38 29.94 29.94 38 20 38 C10.06 38 2 29.94 2 20 L15 20 Z"
          fill="none"
          stroke="var(--color-background)"
          strokeWidth="3"
        />
        <circle cx="20" cy="20" r="4" fill="var(--color-background)" stroke="var(--color-background)" strokeWidth="3" />
      </svg>
    </>
  );
}

/** Measure container and compute square tile size that fits COLS × ROWS. */
function useTileSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const size = Math.floor(Math.min(w / COLS, h / ROWS));
    setTileSize(size);
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return { containerRef, tileSize };
}

export function ViewPage() {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const sorted = useViewSort(sections, sortOption);
  const { containerRef, tileSize } = useTileSize();

  const count = sorted.length;

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-sm font-medium text-muted-foreground">
          <span className="text-foreground font-bold text-lg">{count}</span>
          <span className="mx-1">/</span>
          <span>151</span>
        </div>
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as ViewSortOption)}
          className="text-sm border rounded-md px-2 py-1.5 bg-background text-foreground cursor-pointer"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid container — measured for tile sizing */}
      <div ref={containerRef} className="flex-1 min-h-0 flex items-start justify-center">
        {tileSize > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${tileSize}px)`,
              gridAutoRows: `${tileSize}px`,
            }}
          >
            {sorted.map((pokemon) => (
              <div
                key={pokemon.id}
                className="relative overflow-visible"
                style={{ width: tileSize, height: tileSize }}
              >
                <PokeballBg pokemon={pokemon} />
                <img
                  src={pokemon.sprite}
                  alt={pokemon.name}
                  className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    imageRendering: 'pixelated',
                    width: tileSize * 1.2,
                  }}
                  loading="lazy"
                />
              </div>
            ))}
            {/* Empty placeholders */}
            {count < 151 &&
              Array.from({ length: 151 - count }, (_, i) => (
                <div
                  key={`empty-${i}`}
                  className="relative"
                  style={{ width: tileSize, height: tileSize }}
                >
                  <svg
                    viewBox="0 0 40 40"
                    className="absolute inset-0 w-full h-full opacity-10"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="2" y="19" width="36" height="2" fill="currentColor" />
                    <circle cx="20" cy="20" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
