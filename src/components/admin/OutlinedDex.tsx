import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeOutlineLayout,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_HEAD,
} from '@/lib/sectionOutlines';
import { dexTileSize } from '@/components/admin/adminDexFit';
import { SectionOverlays, StaticViewTile } from '@/components/view/ViewPage';
import { BUILD_GROUP_IDS } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';
import type { Pokemon } from '@/types/pokemon';

const GRID_COLS = 15;

const DexTile = memo(function DexTile({
  pokemon,
  tileSize,
}: {
  pokemon: Pokemon;
  tileSize: number;
}) {
  return (
    <div data-dex-id={pokemon.id}>
      <StaticViewTile pokemon={pokemon} tileSize={tileSize} />
    </div>
  );
});

export const OutlinedDex = memo(function OutlinedDex({
  sections,
  presentIds,
}: {
  sections: Record<string, number[]>;
  presentIds: number[];
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { sorted, layout, allStartRows } = useMemo(() => {
    const orderedIds: number[] = [];
    const seen = new Set<number>();
    const groupIds = [...BUILD_GROUP_IDS, ...Object.keys(sections).filter((k) => !BUILD_GROUP_IDS.includes(k))];
    for (const gid of groupIds) {
      for (const id of sections[gid] ?? []) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedIds.push(id);
        }
      }
    }
    const sortedP = orderedIds.map((id) => getPokemonById(id)).filter((p): p is NonNullable<typeof p> => !!p);
    const totalSlots = Math.max(1, sortedP.length);
    const nextLayout = computeOutlineLayout(sortedP, sections, totalSlots, GRID_COLS);
    return {
      sorted: sortedP,
      layout: nextLayout,
      allStartRows: new Set<number>([...nextLayout.gridStartRows, ...nextLayout.lastRowStartRows]),
    };
  }, [sections]);

  if (sorted.length === 0) {
    return <p className="text-xs text-muted-foreground">No sectioned build to show.</p>;
  }

  const tileSize = dexTileSize(width, GRID_COLS);
  const { gridSlots, allRuns, lastRowGeom, gridStartRows, lastRowStartRows } = layout;
  const gap = tileSize * OUTLINE_GAP;
  const pad = tileSize * OUTLINE_PAD;
  const headroom = tileSize * OUTLINE_HEAD;
  const gridWidth = GRID_COLS * tileSize + (GRID_COLS - 1) * gap;
  const gridPokemon = sorted.slice(0, gridSlots);
  const lastRowPokemon = sorted.slice(gridSlots);
  const totalGridRows = Math.ceil(gridSlots / GRID_COLS);
  const gridRowTemplate = Array.from({ length: totalGridRows }, (_, r) =>
    gridStartRows.has(r) ? `${headroom + tileSize}px` : `${tileSize}px`,
  ).join(' ');
  const gridBlockHeight =
    totalGridRows * tileSize + gridStartRows.size * headroom + Math.max(totalGridRows - 1, 0) * gap;
  const lastRowGap = totalGridRows > 0 ? gap : 0;
  const lastRowHeight = tileSize + (lastRowStartRows.size > 0 ? headroom : 0);

  return (
    <div ref={wrapRef} className="w-full overflow-x-clip" data-testid="admin-dex-snapshot" data-count={presentIds.length}>
      <div className="relative mx-auto" style={{ width: gridWidth, padding: pad, boxSizing: 'content-box' }}>
        <div className="relative">
          <div
            className="grid items-end"
            style={{
              gridTemplateColumns: `repeat(${GRID_COLS}, ${tileSize}px)`,
              columnGap: gap,
              rowGap: gap,
              ...(gridRowTemplate ? { gridTemplateRows: gridRowTemplate } : { gridAutoRows: `${tileSize}px` }),
            }}
          >
            {gridPokemon.map((p) => (
              <DexTile key={p.id} pokemon={p} tileSize={tileSize} />
            ))}
          </div>
          {lastRowPokemon.length > 0 && (
            <div className="flex items-end justify-center" style={{ height: lastRowHeight, columnGap: gap, marginTop: lastRowGap }}>
              {lastRowPokemon.map((p) => (
                <DexTile key={p.id} pokemon={p} tileSize={tileSize} />
              ))}
            </div>
          )}
          {allRuns.length > 0 && (
            <SectionOverlays
              runs={allRuns}
              cols={GRID_COLS}
              tileSize={tileSize}
              startRows={allStartRows}
              headroom={headroom}
              gap={gap}
              pad={pad}
              totalHeight={gridBlockHeight + (lastRowPokemon.length > 0 ? lastRowGap + lastRowHeight : 0)}
              lastRow={lastRowGeom}
            />
          )}
        </div>
      </div>
    </div>
  );
});
