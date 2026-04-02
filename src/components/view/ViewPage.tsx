import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { displayName } from '@/lib/utils';
import { TYPE_COLORS, TYPE_TEXT_COLORS } from '@/data/type-colors';
import type { TypeName } from '@/types/pokemon';

const SORT_OPTIONS: { value: ViewSortOption; label: string }[] = [
  { value: 'regional', label: 'Regional Dex' },
  { value: 'national', label: 'National Dex' },
  { value: 'type', label: 'Type' },
  { value: 'build-order', label: 'Build Order' },
];

export function ViewPage() {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const sorted = useViewSort(sections, sortOption);

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

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-10 gap-1">
          {sorted.map((pokemon) => (
            <div
              key={pokemon.id}
              className="flex flex-col items-center py-1 rounded hover:bg-muted/50 transition-colors"
            >
              <img
                src={pokemon.sprite}
                alt={displayName(pokemon.name)}
                className="w-10 h-10"
                style={{ imageRendering: 'pixelated' }}
                loading="lazy"
              />
              <span className="text-[8px] font-medium capitalize truncate text-center leading-tight w-full px-0.5">
                {displayName(pokemon.name)}
              </span>
              <div className="flex gap-0.5 mt-0.5 justify-center">
                {pokemon.types.map((t) => (
                  <span
                    key={t}
                    className="w-5 py-px rounded text-[5px] font-semibold capitalize leading-tight text-center truncate flex items-center justify-center"
                    style={{
                      backgroundColor: TYPE_COLORS[t as TypeName],
                      color: TYPE_TEXT_COLORS[t as TypeName],
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {/* Empty placeholders */}
          {count < 151 &&
            Array.from({ length: 151 - count }, (_, i) => (
              <div
                key={`empty-${i}`}
                className="flex flex-col items-center justify-center py-1 rounded"
              >
                <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/20" />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
