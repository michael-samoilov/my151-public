import { useRef, useState, useEffect, useCallback } from 'react';
import { Settings, Download, Loader2 } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { TYPE_COLORS } from '@/data/type-colors';
import type { Pokemon, TypeName } from '@/types/pokemon';
import { PageFooter } from '@/components/shared/PageFooter';
import { generateExportImage, downloadBlob } from '@/lib/exportImage';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';

const COLS = 10;
const SPACER_HEIGHT = 64; // h-16 pokeball spacer

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
        className="absolute inset-0 w-full h-full opacity-[0.33] -rotate-[30deg]"
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
        className="absolute inset-0 w-full h-full -rotate-[30deg]"
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

/** Settings gear with sort options dropdown. */
function ViewSettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-30 min-w-[160px] py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Sort Order
          </div>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setSortOption(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors ${
                sortOption === opt.value
                  ? 'text-primary font-medium bg-primary/10'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Measure container and compute square tile size that fits all items. */
function useTileSize(totalSlots: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tileSize, setTileSize] = useState(0);
  const slotsRef = useRef(totalSlots);
  slotsRef.current = totalSlots;

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight - SPACER_HEIGHT;
    const rows = Math.ceil(slotsRef.current / COLS);
    const size = Math.floor(Math.min(w / COLS, h / Math.max(rows, 1)));
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

  // Re-measure when slot count changes
  useEffect(() => {
    measure();
  }, [totalSlots, measure]);

  return { containerRef, tileSize };
}

export function ViewPage() {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const sorted = useViewSort(sections, sortOption);
  const count = sorted.length;
  const totalSlots = Math.max(count, 151);
  const { containerRef, tileSize } = useTileSize(totalSlots);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting || sorted.length === 0) return;
    setExporting(true);
    try {
      const blob = await generateExportImage(sorted, window.location.origin, new Date().getFullYear());
      downloadBlob(blob, `my-personal-151.png`);
      sendExportBeacon(sorted.map((p) => p.id));
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [sorted, exporting]);

  return (
    <div className="h-full flex flex-col">
      {/* Header band — matches build page */}
      <div className="flex items-center justify-between px-4 py-2 border-b h-11">
        <h2 className="text-2xl font-extrabold tracking-tight leading-none">
          <span className="text-primary">{count}</span>
          <span className="text-foreground">/151</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExport}
            disabled={exporting || count === 0}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
          <ViewSettingsMenu />
        </div>
      </div>

      {/* Grid container — measured for tile sizing */}
      <div ref={containerRef} className="flex-1 min-h-0 flex items-start justify-center p-2">
        {tileSize > 0 && (() => {
          // Split: full rows in grid, last partial row flex-centered
          const lastRowCount = totalSlots % COLS || COLS;
          const gridSlots = totalSlots - lastRowCount;
          const gridPokemon = sorted.slice(0, gridSlots);
          const lastRowPokemon = sorted.slice(gridSlots);
          const gridEmpties = Math.max(0, gridSlots - gridPokemon.length);
          const lastRowEmpties = Math.max(0, lastRowCount - lastRowPokemon.length);

          const EmptyPlaceholder = ({ k }: { k: string }) => (
            <div key={k} className="relative" style={{ width: tileSize, height: tileSize }}>
              <svg
                viewBox="0 0 24 24"
                className="absolute inset-[10%] w-[80%] h-[80%] text-muted-foreground/15 -rotate-[30deg]"
              >
                <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </div>
          );

          return (
          <div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${COLS}, ${tileSize}px)`,
                gridAutoRows: `${tileSize}px`,
              }}
            >
              {gridPokemon.map((pokemon) => (
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
                    style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
                    loading="lazy"
                  />
                </div>
              ))}
              {gridEmpties > 0 &&
                Array.from({ length: gridEmpties }, (_, i) => (
                  <EmptyPlaceholder key={`empty-${i}`} k={`empty-${i}`} />
                ))}
            </div>
            {/* Last partial row — flex centered */}
            <div className="flex justify-center" style={{ height: tileSize }}>
              {lastRowPokemon.map((pokemon) => (
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
                    style={{ imageRendering: 'pixelated', width: tileSize * 1.2 }}
                    loading="lazy"
                  />
                </div>
              ))}
              {lastRowEmpties > 0 &&
                Array.from({ length: lastRowEmpties }, (_, i) => (
                  <EmptyPlaceholder key={`empty-last-${i}`} k={`empty-last-${i}`} />
                ))}
            </div>
            <PageFooter />
          </div>
          );
        })()}
      </div>
    </div>
  );
}
