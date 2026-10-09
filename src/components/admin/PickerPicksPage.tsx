import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TYPE_COLORS } from '@/data/type-colors';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { DesktopPane } from '@/favorites/components/DesktopPane';
import { FavoritesGrid } from '@/favorites/components/FavoritesGrid';
import { PickerTitle } from '@/favorites/components/PickerTitle';
import { PrettySpriteGrid } from '@/favorites/components/PrettySpriteGrid';
import { coordinateLabel } from '@/favorites/components/coordinatePresentation';
import { getPickerMon } from '@/favorites/model/catalog';
import { EXTRA_COLOR, cellKey, isTypeName, type GenAxisId, type TypeAxisId } from '@/favorites/model/cells';
import { kindFor } from '@/favorites/model/eligibility';
import { pickerRowInsetPx, pickerSpriteCssPx } from '@/favorites/model/pickerSprite';
import { prettyRows } from '@/favorites/model/prettyWrap';
import type { FavoritePicks } from '../../../api/_favoriteAggregate';
import { PicksPage } from './PicksDetailPage';
import { rankCell, topFills, type PickCell } from './pickerPicks';

/** The selector's columns, as in the app. */
const MAX_COLS = 6;
/** The count band under each selector sprite: a bar and its number. */
const CAPTION_PX = 16;

function axisColor(type: TypeAxisId): string {
  return isTypeName(type) ? TYPE_COLORS[type] : EXTRA_COLOR[type];
}

function PickCount({ picks, max, color }: { picks: number; max: number; color: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-end gap-[3px] px-[8%]" data-pick-count={picks} data-unpicked={picks === 0 || undefined}>
      <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ backgroundColor: `${color}26` }} aria-hidden>
        <div className="h-full rounded-full" data-pick-bar style={{ width: `${max > 0 ? (picks / max) * 100 : 0}%`, backgroundColor: color }} />
      </div>
      <span className="text-[0.625rem] font-semibold leading-none tabular-nums text-muted-foreground">{picks}</span>
    </div>
  );
}

/** The app's selector, read-only: no type or origin icons, and a pick count
 *  under each Pokémon, most picked first. */
function PickSelector({
  cell,
  rows,
  charts,
  desktop,
  onClose,
}: {
  cell: PickCell;
  rows: [number, number][];
  charts: number;
  desktop: boolean;
  onClose: () => void;
}) {
  const { type, gen } = cell;
  const ranked = useMemo(() => rankCell(cell, rows), [cell, rows]);
  const counts = useMemo(() => new Map(ranked.map((r) => [r.mon.id, r.picks])), [ranked]);
  const mons = useMemo(() => ranked.map((r) => r.mon), [ranked]);
  const max = ranked[0]?.picks ?? 0;
  const filled = ranked.reduce((n, r) => n + r.picks, 0);
  const color = axisColor(type);
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const inset = pickerRowInsetPx(viewportPx, spritePx);
  const widestRow = Math.max(0, ...prettyRows(mons, MAX_COLS).map((row) => row.length));
  const paneWidth = Math.max(200, spritePx * widestRow + inset * 2 + 2);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const [summaryWidth, setSummaryWidth] = useState(0);
  useLayoutEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    const measure = () => setSummaryWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const summary = (
    <span ref={summaryRef} className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground" data-testid="admin-pick-summary">
      {filled} of {charts} charts
    </span>
  );
  const title = (
    <PickerTitle
      type={type}
      gen={gen}
      maxWidth={desktop ? undefined : Math.max(1, viewportPx - summaryWidth - 16)}
      gapPx={desktop ? 6 : 2}
    />
  );
  // Fade a Pokémon no chart picked here, as the Dex picks page fades a drop.
  const body = (
    <div
      className="pb-4 pt-1 [&_[data-selector-tile]:has([data-unpicked])_img]:opacity-40"
      style={{ paddingLeft: inset, paddingRight: inset }}
    >
      {mons.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No picks yet.</p>
      ) : (
        <PrettySpriteGrid
          mons={mons}
          maxCols={MAX_COLS}
          onPick={() => {}}
          showIcons={false}
          pointer={kindFor(type, gen) === 'pointer'}
          fitToHeight={false}
          caption={(mon) => <PickCount picks={counts.get(mon.id) ?? 0} max={max} color={color} />}
          captionPx={CAPTION_PX}
        />
      )}
    </div>
  );

  if (desktop) {
    return (
      <DesktopPane type={type} gen={gen} minWidth={paneWidth} onClose={onClose}>
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
          {title}
          {summary}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </DesktopPane>
    );
  }
  return (
    <BottomSheet
      onClose={onClose}
      title={<span className="flex w-full items-center gap-1 px-1 py-0.5 text-left">{title}</span>}
      headerAccessory={summary}
      closeLabel="Close"
      dialogLabel={coordinateLabel(type, gen)}
      size="content"
    >
      <div data-testid="favorites-picker">{body}</div>
    </BottomSheet>
  );
}

/** Picker's Most picked page: the app's wide grid, each cell showing its
 *  most-picked Pokémon across the charts active in the range. A cell opens
 *  the selector with every Pokémon's pick count. */
export function PickerPicksPage({ picks, onBack }: { picks: FavoritePicks; onBack: () => void }) {
  const desktop = useIsDesktop();
  const fills = useMemo(() => topFills(picks.cells), [picks.cells]);
  const [selected, setSelected] = useState<PickCell | null>(null);
  const select = (type: TypeAxisId, gen: GenAxisId) => {
    const kind = kindFor(type, gen);
    if (kind === 'disabled' || kind === 'null') return;
    setSelected((now) => (desktop && now?.type === type && now.gen === gen ? null : { type, gen }));
  };
  const selector = selected ? (
    <PickSelector
      key={cellKey(selected.type, selected.gen)}
      cell={selected}
      rows={picks.cells[cellKey(selected.type, selected.gen)] ?? []}
      charts={picks.charts}
      desktop={desktop}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return (
    <TooltipProvider>
      <PicksPage n={picks.charts} unit="charts" onBack={onBack} fill>
        <div className="min-h-0 flex-1" data-testid="admin-picker-picks">
          <FavoritesGrid
            fills={fills}
            resolve={getPickerMon}
            selected={selected}
            onSelect={select}
            desktop={desktop}
            fitFrame
            pane={desktop ? selector : null}
          />
        </div>
      </PicksPage>
      {desktop ? null : selector}
    </TooltipProvider>
  );
}
