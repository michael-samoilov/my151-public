import { useMemo, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { MILESTONE_DEFS, DEX_TOTAL, type MilestoneFeature } from '@/lib/milestones';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BarChart3, Camera, Sparkles, Trophy, Lock, type LucideIcon } from 'lucide-react';

/**
 * The milestone progress spine — a slim bar with a tick at each milestone
 * (25/50/100/151). The fill tracks the CURRENT count; each tick's unlocked
 * state tracks the sticky `milestoneMax`, so a feature earned then partially
 * un-built still reads as unlocked. Placed absolutely-centered in the n/151
 * header by its parent, so it never shifts as page-specific buttons change.
 */

const FEATURE_ICON: Record<MilestoneFeature, LucideIcon> = {
  analytics: BarChart3,
  view: Camera,
  stats: Sparkles,
  complete: Trophy,
};

/** Which milestones gate a feature behind a lock (vs. a plain progress beat). */
const GATED: Record<MilestoneFeature, boolean> = {
  analytics: true,
  view: false,
  stats: true,
  complete: false,
};

export function MilestoneBar() {
  const sections = usePokedexStore((s) => s.sections);
  const milestoneMax = usePokedexStore((s) => s.milestoneMax);
  const count = useMemo(
    () => Object.values(sections).reduce((sum, ids) => sum + ids.length, 0),
    [sections],
  );

  const pct = Math.min(100, (count / DEX_TOTAL) * 100);

  return (
    <div className="w-[10.5rem] sm:w-[15rem] select-none">
      <div className="relative h-1.5 rounded-full bg-muted">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
        {/* Ticks */}
        {MILESTONE_DEFS.map((m) => {
          const leftPct = (m.at / DEX_TOTAL) * 100;
          const reached = count >= m.at;
          const unlocked = milestoneMax >= m.at;
          return (
            <MilestoneTick
              key={m.at}
              at={m.at}
              leftPct={leftPct}
              reached={reached}
              unlocked={unlocked}
              gated={GATED[m.feature]}
              Icon={FEATURE_ICON[m.feature]}
              title={m.title}
              detail={m.detail}
              remaining={Math.max(0, m.at - count)}
            />
          );
        })}
      </div>
    </div>
  );
}

function MilestoneTick({
  at,
  leftPct,
  reached,
  unlocked,
  gated,
  Icon,
  title,
  detail,
  remaining,
}: {
  at: number;
  leftPct: number;
  reached: boolean;
  unlocked: boolean;
  gated: boolean;
  Icon: LucideIcon;
  title: string;
  detail: string;
  remaining: number;
}) {
  const [open, setOpen] = useState(false);
  // Locked = a gated feature not yet earned. Show a lock; otherwise the feature
  // glyph, lit once its milestone has been reached.
  const locked = gated && !unlocked;
  const Glyph = locked ? Lock : Icon;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${at}: ${title}`}
          onClick={() => setOpen((v) => !v)}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border transition-colors duration-300"
          style={{
            left: `${leftPct}%`,
            width: '1.05rem',
            height: '1.05rem',
          }}
          data-reached={reached}
          data-unlocked={unlocked}
        >
          {/* Circle backdrop */}
          <span
            className={[
              'absolute inset-0 rounded-full border transition-colors duration-300',
              unlocked
                ? 'bg-primary border-primary'
                : 'bg-background border-muted-foreground/40',
            ].join(' ')}
          />
          <Glyph
            className={[
              'relative w-2.5 h-2.5 transition-colors duration-300',
              unlocked ? 'text-primary-foreground' : 'text-muted-foreground/70',
            ].join(' ')}
            strokeWidth={2.5}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[13rem] text-center">
        <div className="font-semibold text-xs">
          {at} · {title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {reached ? detail : `${remaining} more to ${gated ? 'unlock' : 'reach'}.`}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
