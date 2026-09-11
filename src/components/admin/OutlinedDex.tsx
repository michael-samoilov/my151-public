import { useMemo } from 'react';
import {
  computeOutlineLayout,
  COLS,
  OUTLINE_GAP,
  OUTLINE_PAD,
  OUTLINE_HEAD,
} from '@/lib/sectionOutlines';
import { SectionOverlays, StaticViewTile } from '@/components/view/ViewPage';
import { BUILD_GROUP_IDS } from '@/data/slot-template';
import { getPokemonById } from '@/hooks/usePokemonData';

/**
 * The dex at one moment, drawn with the real View-page section outlines. The
 * layout comes from the user's full section assignment (so tiles never move as
 * you scrub); tiles present in the scrubbed session show their sprite, absent
 * ones fade. Reuses the app's exact outline geometry and overlay renderer, so
 * it matches the builder's "section outlines" view rather than approximating it.
 */
export function OutlinedDex({
  sections,
  presentIds,
  tileSize = 30,
}: {
  sections: Record<string, number[]>;
  presentIds: number[];
  tileSize?: number;
}) {
  const present = useMemo(() => new Set(presentIds), [presentIds]);

  // Ordered list of every sectioned pokemon (build-group order), and the layout
  // it produces. Memoized on the section structure, not the scrubbed session.
  const { sorted, layout } = useMemo(() => {
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
    const totalSlots = Math.max(COLS, Math.ceil(sortedP.length / COLS) * COLS);
    return { sorted: sortedP, layout: computeOutlineLayout(sortedP, sections, totalSlots, COLS) };
  }, [sections]);

  if (sorted.length === 0) {
    return <p className="text-xs text-muted-foreground">No sectioned build to show.</p>;
  }

  const { gridSlots, allRuns, lastRowGeom, gridStartRows, lastRowStartRows } = layout;
  const gap = tileSize * OUTLINE_GAP;
  const pad = tileSize * OUTLINE_PAD;
  const headroom = tileSize * OUTLINE_HEAD;
  const gridWidth = COLS * tileSize + (COLS - 1) * gap;
  const gridPokemon = sorted.slice(0, gridSlots);
  const lastRowPokemon = sorted.slice(gridSlots);
  const totalGridRows = Math.ceil(gridSlots / COLS) || 1;
  const gridRowTemplate = Array.from({ length: totalGridRows }, (_, r) =>
    gridStartRows.has(r) ? `${headroom + tileSize}px` : `${tileSize}px`,
  ).join(' ');
  const gridBlockHeight =
    totalGridRows * tileSize + gridStartRows.size * headroom + Math.max(totalGridRows - 1, 0) * gap;
  const lastRowHeight = tileSize + (lastRowStartRows.size > 0 ? headroom : 0);
  const allStartRows = new Set<number>([...gridStartRows, ...lastRowStartRows]);

  const tile = (p: NonNullable<ReturnType<typeof getPokemonById>>) => (
    <div key={p.id} style={{ opacity: present.has(p.id) ? 1 : 0.14 }}>
      <StaticViewTile pokemon={p} tileSize={tileSize} />
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width: gridWidth, padding: pad }}>
        <div className="relative">
          <div
            className="grid items-end"
            style={{ gridTemplateColumns: `repeat(${COLS}, ${tileSize}px)`, columnGap: gap, rowGap: gap, gridTemplateRows: gridRowTemplate }}
          >
            {gridPokemon.map(tile)}
          </div>
          {lastRowPokemon.length > 0 && (
            <div className="flex items-end justify-center" style={{ height: lastRowHeight, columnGap: gap, marginTop: gap }}>
              {lastRowPokemon.map(tile)}
            </div>
          )}
          {allRuns.length > 0 && (
            <SectionOverlays
              runs={allRuns}
              cols={COLS}
              tileSize={tileSize}
              startRows={allStartRows}
              headroom={headroom}
              gap={gap}
              pad={pad}
              totalHeight={gridBlockHeight + (lastRowPokemon.length > 0 ? gap + lastRowHeight : 0)}
              lastRow={lastRowGeom}
            />
          )}
        </div>
      </div>
    </div>
  );
}
