import { useMemo, useState, type ReactNode } from 'react';
import { Seg } from '@/components/admin/ui';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { sectionName } from '@/i18n';
import { sectionColor } from '@/lib/sectionColors';
import { cn, displayName } from '@/lib/utils';
import {
  barColumns,
  formatIndex,
  indexBarPct,
  isStarterTypeName,
  viewsForPicks,
  type DualColumn,
  type LineMember,
  type RankedLine,
  type SectionPicksView,
  type StarterType,
} from './picksStats';

function maxIndex(lines: RankedLine[]): number {
  let max = 0;
  for (const line of lines) {
    if (line.index > max) max = line.index;
  }
  return max;
}

function faceOf(line: RankedLine): LineMember {
  let best = line.members[0];
  for (const m of line.members) {
    if (m.picks > best.picks) best = m;
  }
  return best;
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

function IndexBarRow({
  line,
  max,
  color,
}: {
  line: RankedLine;
  max: number;
  color: string;
}) {
  const member = faceOf(line);
  const label = displayName(member.name);
  const title = `${label}: ${line.picks} dexes · ${formatIndex(line.index)} expected`;
  const pct = indexBarPct(line.index, max);
  const faded = line.picks === 0;
  return (
    <div
      className={cn('flex min-w-0 items-center gap-1', faded && 'opacity-40')}
      title={title}
      data-index-meter={formatIndex(line.index)}
      data-face-id={member.id}
    >
      {member.sprite ? (
        <img
          src={member.sprite}
          alt={title}
          loading="lazy"
          className="h-5 w-5 shrink-0 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : (
        <span className="w-5 shrink-0 text-center text-[0.5rem] text-muted-foreground">#{member.id}</span>
      )}
      <div
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: `${color}22` }}
        aria-hidden
      >
        <div
          data-index-fill
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-[1.75rem] shrink-0 text-right text-[0.5rem] tabular-nums leading-none"
        style={{ color }}
      >
        {formatIndex(line.index)}
      </span>
    </div>
  );
}

function BarSide({
  lines,
  max,
  color,
}: {
  lines: RankedLine[];
  max: number;
  color: string;
}) {
  if (lines.length === 0) {
    return <p className="text-[0.65rem] text-muted-foreground">None in this cap.</p>;
  }
  const cols = barColumns(lines);
  return (
    <div className={cn('grid min-w-0 gap-x-1.5', cols.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {cols.map((col, i) => (
        <div key={i} className="flex min-w-0 flex-col gap-1" data-bar-col>
          {col.map((line) => (
            <IndexBarRow key={line.key} line={line} max={max} color={color} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DualBars({
  columns,
  barColor,
  showLeast,
}: {
  columns: DualColumn;
  barColor: string;
  showLeast: boolean;
}) {
  const leastOn = showLeast && columns.least.length > 0;
  const max = leastOn
    ? Math.max(maxIndex(columns.most), maxIndex(columns.least))
    : maxIndex(columns.most);
  if (!leastOn) {
    return (
      <div className="min-w-0" data-picks-side="most">
        <BarSide lines={columns.most} max={max} color={barColor} />
      </div>
    );
  }
  return (
    <div className="grid min-w-0 grid-cols-2 gap-x-1.5">
      <div className="min-w-0" data-picks-side="most">
        <div className="mb-1 text-[0.65rem] font-semibold">Most</div>
        <BarSide lines={columns.most} max={max} color={barColor} />
      </div>
      <div className="min-w-0 border-l border-border/60 pl-1.5" data-picks-side="least">
        <div className="mb-1 text-[0.65rem] font-semibold">Least</div>
        <BarSide lines={columns.least} max={max} color={barColor} />
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
}: {
  view: SectionPicksView;
  showLeast: boolean;
}) {
  const { stroke } = sectionColor(view.sectionId);
  return (
    <SectionBox sectionId={view.sectionId}>
      {view.kind === 'starter' ? (
        <div className="flex flex-col gap-2">
          {view.groups.map((g) => (
            <div key={g.type}>
              <StarterTypeHeading type={g.type} />
              <DualBars columns={g} barColor={stroke} showLeast={showLeast} />
            </div>
          ))}
        </div>
      ) : (
        <DualBars columns={view.columns} barColor={stroke} showLeast={showLeast} />
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
  const sections = useMemo(
    () => viewsForPicks(picksBySectionAll, { offSection, excludeOneOffs: offSection && excludeOneOffs }),
    [picksBySectionAll, offSection, excludeOneOffs],
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
            ? 'Placed off their default section. Evil-team chain mates (Rhyhorn with Rhydon) stay in-section.'
            : '1.0× = random rate among this section\'s evo lines. Most is over 1.10×. Least sits at the bottom of its list.'}
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
            <SectionBlock key={s.sectionId} view={s} showLeast={!offSection} />
          ))}
        </div>
      )}
    </div>
  );
}
