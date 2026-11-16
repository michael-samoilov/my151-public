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
import { Seg } from './ui';
import { cn } from '@/lib/utils';
import { formatPreferenceStrength, rankCell, topFills, type PickCell, type PickFilter } from './pickerPicks';

const MAX_COLS = 6;
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

function PickSelector({
  cell,
  rows,
  filter,
  charts,
  desktop,
  onClose,
}: {
  cell: PickCell;
  rows: [number, number][];
  filter: PickFilter;
  charts: number;
  desktop: boolean;
  onClose: () => void;
}) {
  const { type, gen } = cell;
  const ranked = useMemo(() => rankCell(cell, rows, filter), [cell, rows, filter]);
  const counts = useMemo(() => new Map(ranked.map((r) => [r.mon.id, r.picks])), [ranked]);
  const options = useMemo(() => ranked.map((r) => ({ mon: r.mon, shiny: false })), [ranked]);
  const max = ranked[0]?.picks ?? 0;
  const filled = ranked.reduce((n, r) => n + r.picks, 0);
  const color = axisColor(type);
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const inset = pickerRowInsetPx(viewportPx, spritePx);
  const widestRow = Math.max(0, ...prettyRows(options, MAX_COLS).map((row) => row.length));
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
  const body = (
    <div
      className="pb-4 pt-1 [&_[data-selector-tile]:has([data-unpicked])_img]:opacity-40"
      style={{ paddingLeft: inset, paddingRight: inset }}
    >
      {options.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No picks yet.</p>
      ) : (
        <PrettySpriteGrid
          options={options}
          maxCols={MAX_COLS}
          onPick={() => {}}
          showIcons={false}
          pointer={kindFor(type, gen) === 'pointer'}
          fitToHeight={false}
          caption={({ mon }) => <PickCount picks={counts.get(mon.id) ?? 0} max={max} color={color} />}
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

type Preference = NonNullable<FavoritePicks['preference']>;
type PreferenceEntry = Preference['entries'][number];
const compactCount = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const countLabel = (count: number, unit: string) => `${compactCount.format(count)} ${unit}${count === 1 ? '' : 's'}`;

function PreferenceCaption({ entry, available }: { entry: PreferenceEntry; available: boolean }) {
  const score = available && entry.evidencePicks > 0 && entry.score != null && Number.isFinite(entry.score) && entry.score > 0
    ? entry.score : null;
  const strength = score == null ? '—' : formatPreferenceStrength(score);
  const title = `${score == null ? 'Preference strength unavailable' : `${strength} preference strength`} · ${entry.picks} picks · ${entry.charts} charts`;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 tabular-nums" data-preference-id={entry.id} title={title}>
      <span className="max-w-full whitespace-nowrap text-[0.625rem] font-semibold leading-none" data-preference-score={score ?? undefined}>{strength}</span>
      <span className="max-w-full whitespace-nowrap text-[0.5rem] leading-none text-muted-foreground">{countLabel(entry.picks, 'pick')}</span>
      <span className="max-w-full whitespace-nowrap text-[0.5rem] leading-none text-muted-foreground">{countLabel(entry.charts, 'chart')}</span>
    </div>
  );
}

function PreferenceRanking({ preference }: { preference: Preference | undefined }) {
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Math.max(1, viewportPx - 32));
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => setWidth(host.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const available = Boolean(preference?.converged && preference.choices > 0);
  const ranked = useMemo(() => {
    const entries = (preference?.entries ?? []).filter((entry) => entry.picks > 0);
    if (!available) entries.sort((a, b) => b.picks - a.picks || a.id - b.id);
    return entries.flatMap((entry) => {
      const mon = getPickerMon(entry.id);
      return mon ? [{ entry, mon }] : [];
    });
  }, [preference, available]);
  const entries = useMemo(() => new Map(ranked.map(({ entry }) => [entry.id, entry])), [ranked]);
  const options = useMemo(() => ranked.map(({ mon }) => ({ mon, shiny: false })), [ranked]);
  const maxCols = Math.max(1, Math.min(MAX_COLS, Math.floor(width / spritePx)));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4" data-testid="admin-picker-preference">
      <div className="mb-3 text-xs leading-snug text-muted-foreground">
        {!preference ? (
          <p>Preference strength is unavailable for this data.</p>
        ) : !preference.converged ? (
          <p>The estimate did not settle, so strength numbers are unavailable. Raw picks and chart counts remain below.</p>
        ) : preference.choices === 0 ? (
          <p>No filled cells offered a comparison. Raw picks and chart counts remain below.</p>
        ) : (
          <p>{preference.choices} comparison choices across {preference.charts} charts. Only Pokémon picked at least once appear below.</p>
        )}
        {preference && preference.components > 1 && (
          <p className="mt-2 font-semibold text-foreground" role="note">
            These choices form {preference.components} separate groups. Comparisons between these groups depend on smoothing.
          </p>
        )}
        <p className="mt-2">Forms count together as one Pokémon.</p>
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-foreground">What does the number mean?</summary>
          <p className="mt-2">
            A Pokémon scoring n× is estimated to be chosen n times as often as an average-scoring Pokémon (1×) when both are offered in the same selector. With only a 2× Pokémon and a 1× Pokémon, that means about 67% versus 33%. The average includes Pokémon offered but never picked.
          </p>
        </details>
      </div>
      <div ref={hostRef} className="min-w-0">
        {options.length > 0 ? (
          <PrettySpriteGrid
            options={options}
            maxCols={maxCols}
            spritePx={spritePx}
            onPick={() => {}}
            showIcons={false}
            fitToHeight={false}
            caption={({ mon }) => <PreferenceCaption entry={entries.get(mon.id)!} available={available} />}
            captionPx={36}
          />
        ) : preference ? (
          <p className="text-xs text-muted-foreground">No picks yet.</p>
        ) : null}
      </div>
    </div>
  );
}

export function PickerPicksPage({ picks, onBack }: { picks: FavoritePicks; onBack: () => void }) {
  const desktop = useIsDesktop();
  const [filter, setFilter] = useState<PickFilter>('all');
  const fills = useMemo(() => topFills(picks.cells, filter), [picks.cells, filter]);
  const [selected, setSelected] = useState<PickCell | null>(null);
  const [view, setView] = useState<'grid' | 'preference'>('preference');
  const excluding = filter === 'no-starters-legendaries';
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
      filter={filter}
      charts={picks.charts}
      desktop={desktop}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return (
    <TooltipProvider>
      <PicksPage
        n={picks.charts}
        unit="charts"
        onBack={onBack}
        fill
        controls={
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Seg
              ariaLabel="Picker picks view"
              options={[{ key: 'preference', label: 'Preference strength' }, { key: 'grid', label: 'Grid' }]}
              value={view}
              onChange={(next) => { setSelected(null); setView(next); }}
            />
            {view === 'grid' && (
              <button
                type="button"
                aria-pressed={excluding}
                onClick={() => setFilter(excluding ? 'all' : 'no-starters-legendaries')}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
                  excluding
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                No starters & legendaries
              </button>
            )}
          </div>
        }
      >
        {view === 'preference' ? <PreferenceRanking preference={picks.preference} /> : (
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
        )}
      </PicksPage>
      {desktop ? null : selector}
    </TooltipProvider>
  );
}
