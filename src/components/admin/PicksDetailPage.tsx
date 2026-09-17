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
  PICKS_LEAST_COLS,
  PICKS_MOST_COLS,
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
  const rows: { cells: Cell[]; spacers: number }[] = [];
  let current: Cell[] = [];
  let col = 0;
  const close = (spacers: number) => {
    rows.push({ cells: current, spacers });
    current = [];
    col = 0;
  };
  for (const line of lines) {
    for (let at = 0; at < line.members.length; at += cols) {
      const piece = line.members.slice(at, at + cols);
      if (col > 0 && col + piece.length > cols) close(cols - col);
      for (const member of piece) {
        current.push({
          member,
          index: line.index,
          linePicks: line.picks,
          key: `${line.key}-${member.id}`,
        });
      }
      col += piece.length;
      if (col === cols) close(0);
    }
  }
  if (current.length > 0) close(cols - col);
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
}: {
  lines: RankedLine[];
  max: number;
  barColor: string;
  countMode: boolean;
  cols?: number;
}) {
  if (lines.length === 0) {
    return <p className="text-[0.65rem] text-muted-foreground">None in this cap.</p>;
  }
  const rows = packLineRows(lines, cols);
  const colClass =
    cols === PICKS_PAIR_COLS
      ? 'grid-cols-12'
      : cols === PICKS_COMBINED_COLS
        ? 'grid-cols-9'
        : cols === PICKS_COLS
          ? 'grid-cols-6'
          : '';
  const colStyle =
    colClass === '' ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined;
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

function CombinedMostLeastGrid({
  columns,
  max,
  barColor,
  countMode,
}: {
  columns: DualColumn;
  max: number;
  barColor: string;
  countMode: boolean;
}) {
  const mostRows = packLineRows(columns.most, PICKS_MOST_COLS);
  const leastRows = packLineRows(columns.least, PICKS_LEAST_COLS);
  const rowCount = Math.max(mostRows.length, leastRows.length);
  if (rowCount === 0) {
    return <p className="text-[0.65rem] text-muted-foreground">None in this cap.</p>;
  }
  return (
    <div className="min-w-0" data-picks-layout="combined-9" data-picks-cols={PICKS_COMBINED_COLS}>
      <div className="mb-1 grid grid-cols-9 gap-0.5">
        <div className="col-span-6 text-[0.65rem] font-semibold">Most</div>
        <div className="col-span-3 border-l border-border/60 pl-1 text-[0.65rem] font-semibold">Least</div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {Array.from({ length: rowCount }, (_, i) => {
          const m = mostRows[i] ?? { cells: [] as Cell[], spacers: PICKS_MOST_COLS };
          const l = leastRows[i] ?? { cells: [] as Cell[], spacers: PICKS_LEAST_COLS };
          return (
            <div key={i} className="grid min-w-0 grid-cols-9 gap-0.5">
              <div className="col-span-6 grid min-w-0 grid-cols-6 gap-0.5" data-picks-side="most">
                {m.cells.map((cell) => (
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
                {Array.from({ length: m.spacers }, (_, s) => (
                  <div key={`ms-${s}`} className="min-w-0" />
                ))}
              </div>
              <div
                className="col-span-3 grid min-w-0 grid-cols-3 gap-0.5 border-l border-border/60 pl-1"
                data-picks-side="least"
              >
                {l.cells.map((cell) => (
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
                {Array.from({ length: l.spacers }, (_, s) => (
                  <div key={`ls-${s}`} className="min-w-0" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DualGrids({
  columns,
  barColor,
  showLeast,
  countMode,
  pairDensity,
}: {
  columns: DualColumn;
  barColor: string;
  showLeast: boolean;
  countMode: boolean;
  pairDensity?: boolean;
}) {
  const isDesktop = useIsDesktop();
  const cols = pairDensity ? picksStarterCols() : picksGridCols(!showLeast, isDesktop);
  const leastOn = showLeast;
  const max = countMode
    ? Math.max(maxPicks(columns.most), leastOn ? maxPicks(columns.least) : 0)
    : leastOn
      ? Math.max(maxIndex(columns.most), maxIndex(columns.least))
      : maxIndex(columns.most);
  if (!showLeast) {
    return (
      <div className="min-w-0 w-full" data-picks-side="most" data-picks-cols={cols}>
        <LineGrid lines={columns.most} max={max} barColor={barColor} countMode={countMode} cols={cols} />
      </div>
    );
  }
  if (!pairDensity) {
    return (
      <CombinedMostLeastGrid
        columns={columns}
        max={max}
        barColor={barColor}
        countMode={countMode}
      />
    );
  }
  return (
    <div className="grid min-w-0 grid-cols-2 gap-x-1.5">
      <div className="min-w-0" data-picks-side="most">
        <div className="mb-1 text-[0.65rem] font-semibold">Most</div>
        <LineGrid lines={columns.most} max={max} barColor={barColor} countMode={countMode} />
      </div>
      <div className="min-w-0 border-l border-border/60 pl-1.5" data-picks-side="least">
        <div className="mb-1 text-[0.65rem] font-semibold">Least</div>
        <LineGrid lines={columns.least} max={max} barColor={barColor} countMode={countMode} />
      </div>
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
  showLeast,
  countMode,
}: {
  view: SectionPicksView;
  showLeast: boolean;
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
                showLeast={showLeast}
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
          showLeast={showLeast}
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
            : '1.0× = random rate among this section\'s evo lines.'}
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
              showLeast={!offSection && s.kind !== 'starter'}
              countMode={offSection}
            />
          ))}
        </div>
      )}
    </div>
  );
}
