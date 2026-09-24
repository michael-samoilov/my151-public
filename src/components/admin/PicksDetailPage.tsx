import { useMemo, useState, type ReactNode } from 'react';
import { Seg } from '@/components/admin/ui';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { sectionName } from '@/i18n';
import { sectionColor } from '@/lib/sectionColors';
import { cn, displayName } from '@/lib/utils';
import {
  formatIndex,
  indexBarPct,
  isStarterTypeName,
  PICKS_COLS,
  PICKS_COMBINED_COLS,
  PICKS_PAIR_COLS,
  picksGridCols,
  picksSplitCap,
  picksStarterCols,
  viewsForPicks,
  type DualColumn,
  type LineMember,
  type RankedLine,
  type SectionPicksView,
  type StarterType,
} from './picksStats';

type Cell = { member: LineMember; index: number; linePicks: number; key: string };

function packLineRows(lines: RankedLine[], cols = PICKS_COLS): { cells: Cell[]; spacers: number }[] {
  const cells: Cell[] = [];
  for (const line of lines) {
    for (const member of line.members) {
      cells.push({
        member,
        index: member.index,
        linePicks: line.picks,
        key: `${line.key}-${member.id}`,
      });
    }
  }
  const rows: { cells: Cell[]; spacers: number }[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    const slice = cells.slice(i, i + cols);
    rows.push({ cells: slice, spacers: cols - slice.length });
  }
  return rows;
}

function maxIndex(lines: RankedLine[]): number {
  let max = 0;
  for (const line of lines) {
    if (line.index > max) max = line.index;
  }
  return max;
}

function maxPicks(lines: RankedLine[]): number {
  let max = 0;
  for (const line of lines) {
    for (const m of line.members) {
      if (m.picks > max) max = m.picks;
    }
  }
  return max;
}

function SectionBox({
  sectionId,
  children,
}: {
  sectionId: string;
  children: ReactNode;
}) {
  const { fill, stroke } = sectionColor(sectionId);
  return (
    <section
      data-section-id={sectionId}
      className="min-w-0 rounded-lg"
      style={{
        backgroundColor: `${fill}10`,
        border: `1px solid ${stroke}30`,
      }}
    >
      <div
        className="px-1.5 text-left text-xs font-semibold uppercase tracking-wide"
        style={{ color: stroke, paddingTop: 4, paddingBottom: 2 }}
      >
        {sectionName(sectionId)}
      </div>
      <div className="min-w-0 px-1.5 pb-1.5">{children}</div>
    </section>
  );
}

function SpriteCell({
  member,
  index,
  linePicks,
  max,
  barColor,
  countMode,
}: {
  member: LineMember;
  index: number;
  linePicks: number;
  max: number;
  barColor: string;
  countMode: boolean;
}) {
  const label = displayName(member.name);
  const value = countMode ? member.picks : index;
  const shown = countMode ? String(member.picks) : formatIndex(index);
  const title = countMode
    ? `${label}: ${member.picks} dexes`
    : `${label}: ${member.picks} dexes · ${formatIndex(index)} expected`;
  const dropped = member.picks === 0 || member.picks < linePicks * 0.5;
  const pct = indexBarPct(value, max);
  return (
    <div
      className={cn('flex min-w-0 flex-col items-center overflow-hidden', dropped && 'opacity-40')}
      title={title}
      data-face-id={member.id}
    >
      <div className="relative aspect-square w-full min-w-0">
        <div className="flex h-full w-full items-center justify-center pb-[5px]">
          {member.sprite ? (
            <img
              src={member.sprite}
              alt={title}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <span className="text-[0.5rem] text-muted-foreground">#{member.id}</span>
          )}
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-full"
          style={{ backgroundColor: `${barColor}22` }}
          aria-hidden
          data-index-meter={shown}
        >
          <div
            data-index-fill
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
      <span
        className="mt-0.5 max-w-full truncate text-[0.5rem] tabular-nums leading-none"
        style={{ color: barColor }}
      >
        {shown}
      </span>
    </div>
  );
}

function LineGrid({
  lines,
  max,
  barColor,
  countMode,
  cols = PICKS_COLS,
  uniformFrTracks = false,
}: {
  lines: RankedLine[];
  max: number;
  barColor: string;
  countMode: boolean;
  cols?: number;
  /** Starter rows: equal fr tracks so nine faces share the row without min-width wrap. */
  uniformFrTracks?: boolean;
}) {
  if (lines.length === 0) {
    return <p className="text-[0.65rem] text-muted-foreground">None in this cap.</p>;
  }
  const rows = packLineRows(lines, cols);
  const colClass = uniformFrTracks
    ? ''
    : cols === PICKS_PAIR_COLS
      ? 'grid-cols-12'
      : cols === PICKS_COMBINED_COLS
        ? 'grid-cols-9'
        : cols === PICKS_COLS
          ? 'grid-cols-6'
          : '';
  const colStyle =
    uniformFrTracks || colClass === ''
      ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
      : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rows.map((row, i) => (
        <div key={i} className={cn('grid min-w-0 gap-0.5', colClass)} style={colStyle}>
          {row.cells.map((cell) => (
            <SpriteCell
              key={cell.key}
              member={cell.member}
              index={cell.index}
              linePicks={cell.linePicks}
              max={max}
              barColor={barColor}
              countMode={countMode}
            />
          ))}
          {Array.from({ length: row.spacers }, (_, s) => (
            <div key={`s-${s}`} className="min-w-0" />
          ))}
        </div>
      ))}
    </div>
  );
}

function DualGrids({
  columns,
  barColor,
  countMode,
  pairDensity,
}: {
  columns: DualColumn;
  barColor: string;
  countMode: boolean;
  pairDensity?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const cols = pairDensity ? picksStarterCols() : picksGridCols(true, isDesktop);
  const max = countMode ? maxPicks(columns.most) : maxIndex(columns.most);
  return (
    <div
      className="min-w-0 w-full"
      data-picks-side="most"
      data-picks-cols={cols}
      data-picks-layout={pairDensity ? undefined : 'section-9'}
    >
      <LineGrid
        lines={columns.most}
        max={max}
        barColor={barColor}
        countMode={countMode}
        cols={cols}
        uniformFrTracks={!!pairDensity}
      />
    </div>
  );
}

function StarterTypeHeading({ type }: { type: StarterType }) {
  if (!isStarterTypeName(type)) {
    return (
      <div className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Other
      </div>
    );
  }
  return (
    <div className="mb-1">
      <TypeBadge type={type} className="w-[5.625rem] max-w-full" />
    </div>
  );
}

function SectionBlock({
  view,
  countMode,
}: {
  view: SectionPicksView;
  countMode: boolean;
}) {
  const { stroke } = sectionColor(view.sectionId);
  return (
    <SectionBox sectionId={view.sectionId}>
      {view.kind === 'starter' ? (
        <div className="flex flex-col gap-2">
          {view.groups.map((g) => (
            <div key={g.type}>
              <StarterTypeHeading type={g.type} />
              <DualGrids
                columns={g}
                barColor={stroke}
                countMode={countMode}
                pairDensity
              />
            </div>
          ))}
        </div>
      ) : (
        <DualGrids
          columns={view.columns}
          barColor={stroke}
          countMode={countMode}
        />
      )}
    </SectionBox>
  );
}

export function PicksDetailPage({
  picksBySectionAll,
  n,
  onBack,
  stickyOffset,
}: {
  picksBySectionAll: Record<string, [string, number][]>;
  n: number;
  onBack: () => void;
  stickyOffset: number;
}) {
  const [view, setView] = useState<'most' | 'off'>('most');
  const [excludeOneOffs, setExcludeOneOffs] = useState(false);
  const offSection = view === 'off';
  const isDesktop = useIsDesktop();
  const splitCap = useMemo(() => picksSplitCap(offSection, isDesktop), [offSection, isDesktop]);
  const sections = useMemo(
    () => viewsForPicks(picksBySectionAll, { offSection, excludeOneOffs: offSection && excludeOneOffs, cap: splitCap }),
    [picksBySectionAll, offSection, excludeOneOffs, splitCap],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className="sticky z-[95] -mx-4 border-b border-border bg-background px-4 py-2"
        style={{ top: stickyOffset }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            ‹ Back
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-bold">What people pick</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">of {n} dexes</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Seg
            ariaLabel="Picks metric"
            options={[
              { key: 'most', label: 'Most picked' },
              { key: 'off', label: 'Off-section' },
            ]}
            value={view}
            onChange={setView}
          />
          {offSection && (
            <button
              type="button"
              aria-pressed={excludeOneOffs}
              onClick={() => setExcludeOneOffs((v) => !v)}
              className={cn(
                'h-7 shrink-0 rounded-full border px-2.5 text-xs font-medium',
                excludeOneOffs
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              Exclude one-offs
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[0.65rem] leading-snug text-muted-foreground">
          {offSection
            ? 'Placed off their default section. Numbers are dex counts. Evil-team chain mates (Rhyhorn with Rhydon) stay in-section.'
            : '1.0× = random rate among this section\'s Pokémon.'}
        </p>
      </div>
      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {offSection
            ? excludeOneOffs
              ? 'No off-section picks chosen more than once.'
              : 'No off-section picks.'
            : 'No picks yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map((s) => (
            <SectionBlock
              key={s.sectionId}
              view={s}
              countMode={offSection}
            />
          ))}
        </div>
      )}
    </div>
  );
}
