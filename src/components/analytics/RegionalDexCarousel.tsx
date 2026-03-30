import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { useRegionalDexAnalytics } from '@/hooks/useRegionalDexAnalytics';
import { ButterflyChart, type ButterflyRow } from './ButterflyChart';
import { TYPE_COLORS } from '@/data/type-colors';
import { GEN_STOPS } from '@/components/shared/GenBadge';

const POKEAPI_TYPE_IDS: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};
const TYPE_ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(POKEAPI_TYPE_IDS).map(([type, id]) => [type, `/sprites/types/${id}.png`]),
);

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

function RegionalDexChart({
  dex,
  excludeSpecial,
  newOnly,
}: {
  dex: typeof REGIONAL_DEXES[0];
  excludeSpecial: boolean;
  newOnly: boolean;
}) {
  const analytics = useRegionalDexAnalytics(dex.pokemonIds, excludeSpecial, newOnly, dex.generation);

  const typeChartData: ButterflyRow[] = useMemo(() =>
    analytics.typeDeviation.map(d => ({
      label: d.type.charAt(0).toUpperCase() + d.type.slice(1),
      count: d.count,
      deviation: d.deviation,
      color: TYPE_COLORS[d.type as keyof typeof TYPE_COLORS],
      icon: TYPE_ICON_URLS[d.type],
    })),
    [analytics.typeDeviation],
  );

  const genChartData: ButterflyRow[] = useMemo(() =>
    analytics.generationDeviation.map((d, i) => {
      const gen = d.generation;
      const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
      return {
        label: `Gen ${gen}`,
        count: d.count,
        deviation: d.deviation,
        color: GEN_COLORS[i % GEN_COLORS.length],
        icon: (x: number, y: number, size: number) => {
          const gradId = `regional-gen-icon-${dex.id}-${gen}`;
          const r = size / 2;
          return (
            <React.Fragment key={gradId}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  {stops.map((s, si) => (
                    <stop key={si} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
              <circle cx={x + r} cy={y + r} r={r} fill={`url(#${gradId})`} />
              <text
                x={x + r} y={y + r} textAnchor="middle" dominantBaseline="central"
                fill="white" fontSize={size * 0.55} fontWeight="800"
                fontFamily="system-ui, sans-serif"
                paintOrder="stroke" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"
              >
                {gen}
              </text>
            </React.Fragment>
          );
        },
      };
    }),
    [analytics.generationDeviation, dex.id],
  );

  if (analytics.total === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No matching Pokemon</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{analytics.total} Pokemon</p>
      <div className="bg-card rounded-lg border p-4">
        <ButterflyChart data={typeChartData} />
      </div>
      <div className="bg-card rounded-lg border p-4">
        <ButterflyChart data={genChartData} rowHeight={28} />
      </div>
    </div>
  );
}

export function RegionalDexCarousel({ excludeSpecial }: { excludeSpecial: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [newOnly, setNewOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Track visible item via IntersectionObserver
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const idx = itemRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx >= 0) setActiveIndex(idx);
          }
        }
      },
      { root: container, threshold: 0.5 },
    );

    for (const ref of itemRefs.current) {
      if (ref) observer.observe(ref);
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = useCallback((idx: number) => {
    itemRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  return (
    <section>
      <h3 className="text-lg font-semibold mb-1">Regional Dex Comparison</h3>
      <p className="text-sm text-muted-foreground mb-4">
        How official regional dexes compare to national proportions.
      </p>

      {/* Region tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3 pb-1">
        {REGIONAL_DEXES.map((dex, i) => (
          <button
            key={dex.id}
            onClick={() => scrollTo(i)}
            className={`shrink-0 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              i === activeIndex
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {dex.name}
          </button>
        ))}
      </div>

      {/* New Only toggle */}
      <div className="flex items-center mb-4">
        <button
          onClick={() => setNewOnly(prev => !prev)}
          className={`flex items-center gap-2 px-3 min-h-[44px] rounded-full text-sm font-medium transition-colors ${
            newOnly
              ? 'bg-muted-foreground/15 text-foreground'
              : 'bg-transparent text-muted-foreground border border-muted-foreground/25'
          }`}
        >
          <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
            newOnly ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'
          }`}>
            {newOnly && <span className="block w-1.5 h-1.5 rounded-full bg-background" />}
          </span>
          New Pokemon only
        </button>
      </div>

      {/* Swipeable carousel */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-4"
        style={{ scrollbarWidth: 'none' }}
      >
        {REGIONAL_DEXES.map((dex, i) => (
          <div
            key={dex.id}
            ref={(el) => { itemRefs.current[i] = el; }}
            className="snap-start shrink-0 w-full"
          >
            <RegionalDexChart dex={dex} excludeSpecial={excludeSpecial} newOnly={newOnly} />
          </div>
        ))}
      </div>
    </section>
  );
}
