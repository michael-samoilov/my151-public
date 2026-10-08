import { useMemo, useState, type ReactNode } from 'react';
import { Seg } from '@/components/admin/ui';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { sectionName, typeLabel } from '@/i18n';
import { NO_TYPE } from '@/league/theme';
import { deriveSectionColor, sectionColor, type SectionColor } from '@/lib/sectionColors';
import { cn, displayName } from '@/lib/utils';
import type { LeaguePicks } from '../../../api/_leaguePicks';
import {
  formatIndex,
  indexBarPct,
  isStarterTypeName,
  leaguePicksSections,
  PICKS_COLS,
  PICKS_COMBINED_COLS,
  PICKS_PAIR_COLS,
  picksGridCols,
  picksSplitCap,
  picksStarterCols,
  viewsForPicks,
  type DualColumn,
  type LeaguePicksSectionId,
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
  name,
  color: { fill, stroke },
  children,
}: {
  sectionId: string;
  name: string;
  color: SectionColor;
  children: ReactNode;
}) {
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
        {name}
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
  unit,
}: {
  member: LineMember;
  index: number;
  linePicks: number;
  max: number;
  barColor: string;
  countMode: boolean;
  unit: string;
}) {
  const label = displayName(member.name);
  const value = countMode ? member.picks : index;
  const shown = countMode ? String(member.picks) : formatIndex(index);
  const title = countMode
    ? `${label}: ${member.picks} ${unit}`
    : `${label}: ${member.picks} ${unit} · ${formatIndex(index)} expected`;
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
  unit = 'dexes',
}: {
  lines: RankedLine[];
  max: number;
  barColor: string;
  countMode: boolean;
  cols?: number;
  unit?: string;
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
              unit={unit}
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
  unit,
}: {
  columns: DualColumn;
  barColor: string;
  countMode: boolean;
  pairDensity?: boolean;
  unit?: string;
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
        unit={unit}
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
  const color = sectionColor(view.sectionId);
  const { stroke } = color;
  return (
    <SectionBox sectionId={view.sectionId} name={sectionName(view.sectionId)} color={color}>
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

export function PicksPage({
  n,
  unit,
  onBack,
  controls,
  fill = false,
  children,
}: {
  n: number;
  unit: string;
  onBack: () => void;
  controls?: ReactNode;
  /** Fill a page that does not scroll. The header then stays in the flow. */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col', fill ? 'min-h-0 flex-1 gap-2' : 'gap-3')}>
      {/* Under the header; on desktop also under the admin bar. */}
      <div
        className={cn(
          'border-b border-border bg-background py-2',
          fill
            ? 'shrink-0'
            : 'sticky top-[var(--admin-header-h,0px)] z-[95] -mx-4 px-4 md:top-[calc(var(--admin-header-h,0px)+var(--admin-bar-h,0px))]',
        )}
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
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">of {n} {unit}</span>
        </div>
        {controls}
      </div>
      {children}
    </div>
  );
}

export function PicksDetailPage({
  picksBySectionAll,
  n,
  onBack,
}: {
  picksBySectionAll: Record<string, [string, number][]>;
  n: number;
  onBack: () => void;
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
    <PicksPage
      n={n}
      unit="dexes"
      onBack={onBack}
      controls={
        <>
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
        </>
      }
    >
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
    </PicksPage>
  );
}

const ACE_COLOR = deriveSectionColor('#404040');

function leagueSectionLook(id: LeaguePicksSectionId): { name: string; color: SectionColor } {
  if (id === 'ace') return { name: 'Ace Pokémon', color: ACE_COLOR };
  if (id === 'none') return { name: 'No type', color: deriveSectionColor(NO_TYPE) };
  return { name: typeLabel(id), color: deriveSectionColor(TYPE_COLORS[id]) };
}

/** The league's picks: its aces, then one section per chosen card type. */
export function LeaguePicksPage({
  picks,
  n,
  onBack,
}: {
  picks: LeaguePicks;
  n: number;
  onBack: () => void;
}) {
  const sections = useMemo(() => leaguePicksSections(picks), [picks]);
  return (
    <PicksPage n={n} unit="leagues" onBack={onBack}>
      {sections.length === 0 ? (
        <p className="text-xs text-muted-foreground">No picks yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(({ id, lines }) => {
            const { name, color } = leagueSectionLook(id);
            return (
              <SectionBox key={id} sectionId={id} name={name} color={color}>
                <DualGrids columns={{ most: lines, least: [] }} barColor={color.stroke} countMode unit="leagues" />
              </SectionBox>
            );
          })}
        </div>
      )}
    </PicksPage>
  );
}
