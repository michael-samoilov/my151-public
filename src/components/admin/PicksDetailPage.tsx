import { useMemo, useState } from 'react';
import { Seg } from '@/components/admin/ui';
import { BUILD_GROUPS } from '@/data/slot-template';
import { typeIconPath } from '@/data/type-ids';
import { cn, displayName } from '@/lib/utils';
import {
  formatIndex,
  isStarterTypeName,
  PICKS_COLS,
  viewsForPicks,
  type DualColumn,
  type LineMember,
  type RankedLine,
  type SectionPicksView,
  type StarterType,
} from './picksStats';

const SECTION_META: Record<string, { name: string; color: string }> = Object.fromEntries(
  BUILD_GROUPS.map((g) => [g.id, { name: g.name, color: g.color }]),
);

const STARTER_LABEL: Record<StarterType, string> = {
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  other: 'Other',
};

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

function SpriteCell({
  member,
  index,
  linePicks,
}: {
  member: LineMember;
  index: number;
  linePicks: number;
}) {
  const label = displayName(member.name);
  const title = `${label}: ${member.picks} dexes · ${formatIndex(index)} expected`;
  const dropped = member.picks === 0 || member.picks < linePicks * 0.5;
  return (
    <div className={cn('flex min-w-0 flex-col items-center overflow-hidden', dropped && 'opacity-40')} title={title}>
      <div className="flex aspect-square w-full min-w-0 items-center justify-center">
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
      <span className="max-w-full truncate text-[0.5rem] tabular-nums leading-none">{formatIndex(index)}</span>
    </div>
  );
}

function LineGrid({ lines }: { lines: RankedLine[] }) {
  if (lines.length === 0) {
    return <p className="text-[0.65rem] text-muted-foreground">None in this cap.</p>;
  }
  const rows = packLineRows(lines);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {rows.map((row, i) => (
        <div key={i} className="grid min-w-0 grid-cols-6 gap-0.5">
          {row.cells.map((cell) => (
            <SpriteCell
              key={cell.key}
              member={cell.member}
              index={cell.index}
              linePicks={cell.linePicks}
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

function DualGrids({ columns }: { columns: DualColumn }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-x-1.5">
      <div className="min-w-0 overflow-hidden">
        <div className="mb-1 text-[0.65rem] font-semibold">Most</div>
        <LineGrid lines={columns.most} />
      </div>
      <div className="min-w-0 overflow-hidden border-l border-border pl-1.5">
        <div className="mb-1 text-[0.65rem] font-semibold">Least</div>
        <LineGrid lines={columns.least} />
      </div>
    </div>
  );
}

function StarterTypeHeading({ type }: { type: StarterType }) {
  return (
    <div className="mb-1 flex items-center gap-1 text-[0.7rem] font-semibold">
      {isStarterTypeName(type) ? (
        <img src={typeIconPath(type)} alt="" className="h-3.5 w-3.5 rounded-[2px]" />
      ) : (
        <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground" />
      )}
      {STARTER_LABEL[type]}
    </div>
  );
}

function SectionBlock({ view }: { view: SectionPicksView }) {
  const meta = SECTION_META[view.sectionId];
  return (
    <section>
      <div className="mb-1 flex items-center gap-1 text-xs font-medium">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: meta?.color ?? '#9ca3af' }} />
        {meta?.name ?? view.sectionId}
      </div>
      {view.kind === 'starter' ? (
        <div className="flex flex-col">
          {view.groups.map((g) => (
            <div key={g.type} className="mt-2 first:mt-0">
              <StarterTypeHeading type={g.type} />
              <DualGrids columns={g} />
            </div>
          ))}
        </div>
      ) : (
        <DualGrids columns={view.columns} />
      )}
    </section>
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
  const sections = useMemo(
    () => viewsForPicks(picksBySectionAll, { offSection, excludeOneOffs: offSection && excludeOneOffs }),
    [picksBySectionAll, offSection, excludeOneOffs],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
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
            ? 'Placed off their default section. Evil-team chain mates (Rhyhorn with Rhydon) stay in-section.'
            : `1.0× = random rate among this section's evo lines. Left = most, right = least.`}
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
        <div className="flex flex-col gap-4">{sections.map((s) => <SectionBlock key={s.sectionId} view={s} />)}</div>
      )}
    </div>
  );
}
