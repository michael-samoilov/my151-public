import { useEffect, useMemo, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { MILESTONE_DEFS, DEX_TOTAL, type MilestoneFeature } from '@/lib/milestones';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BarChart3, Camera, Sparkles, Trophy, Lock, type LucideIcon } from 'lucide-react';

/**
 * The milestone progress spine — a slim runway with a bead at each milestone
 * (25/50/100/151). Layering (bottom→top), per the intended look:
 *   1. grey runway track (full width, to 151) + grey idle beads
 *   2. red progress fill (to current count) + red beads for reached milestones
 *   3. icons
 * The fill tracks the CURRENT count; a bead's unlocked glyph tracks the sticky
 * `milestoneMax`. Placed absolutely-centered in the n/151 header by its parent,
 * so it never shifts as page-specific buttons differ.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — every visual knob in one place. Sizes are in rem so they scale with
// the app's root font-size. Tune freely.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  // Overall track width (kept fixed so the centered bar never resizes).
  widthMobileRem: 11,
  widthDesktopRem: 15.5,

  // Runway line (grey) + red progress fill.
  trackThicknessRem: 0.3, // stroke size of the runway
  trackColor: 'color-mix(in srgb, var(--color-muted-foreground) 24%, transparent)',
  fillColor: 'var(--color-primary)',
  fillTransitionMs: 550, // how the red fill glides as count changes

  // Milestone beads.
  beadSizeRem: 1.15, // diameter
  beadIdleColor: 'color-mix(in srgb, var(--color-muted-foreground) 30%, transparent)',
  beadReachedColor: 'var(--color-primary)',
  reachedFillTransitionMs: 300, // fade/scale of a bead turning red on reach

  // Icons.
  iconScale: 0.5, // icon size as a fraction of beadSize  (↓ = smaller icon)
  iconStroke: 2.5,
  iconIdleColor: 'var(--color-muted-foreground)',
  iconReachedColor: 'var(--color-primary-foreground)',

  // Reach micro-interaction (the one-time "pop" when a bead is first reached).
  popScale: 1.4, // peak scale of the pop
  popDurationMs: 440,
  rippleDurationMs: 560, // expanding ring behind the bead
  rippleColor: 'var(--color-primary)',
} as const;

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
    <div
      className="milestone-bar select-none"
      style={{
        // Responsive width via CSS vars (the media query lives in index.css so
        // CONFIG stays the single source of truth).
        ['--ms-w-mobile' as string]: `${CONFIG.widthMobileRem}rem`,
        ['--ms-w-desktop' as string]: `${CONFIG.widthDesktopRem}rem`,
      }}
    >
      <div
        className="milestone-bar-inner relative"
        style={{ height: `${CONFIG.beadSizeRem}rem` }}
      >
        {/* Layer 1a — grey runway track, full width to 151 */}
        <div
          className="absolute top-1/2 left-0 right-0 -translate-y-1/2 rounded-full"
          style={{ height: `${CONFIG.trackThicknessRem}rem`, background: CONFIG.trackColor }}
        />
        {/* Layer 2a — red progress fill, to current count */}
        <div
          className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full"
          style={{
            height: `${CONFIG.trackThicknessRem}rem`,
            width: `${pct}%`,
            background: CONFIG.fillColor,
            transition: `width ${CONFIG.fillTransitionMs}ms ease-out`,
          }}
        />
        {/* Beads (each renders its own grey→red layers + icon on top) */}
        {MILESTONE_DEFS.map((m) => (
          <MilestoneBead
            key={m.at}
            at={m.at}
            leftPct={(m.at / DEX_TOTAL) * 100}
            reached={count >= m.at}
            unlocked={milestoneMax >= m.at}
            gated={GATED[m.feature]}
            Icon={FEATURE_ICON[m.feature]}
            title={m.title}
            detail={m.detail}
            remaining={Math.max(0, m.at - count)}
          />
        ))}
      </div>
    </div>
  );
}

function MilestoneBead({
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

  // One-time "pop" the first time this bead flips to reached in-session.
  const prevReached = useRef(reached);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (reached && !prevReached.current) {
      setPopping(true);
      const t = setTimeout(() => setPopping(false), CONFIG.rippleDurationMs);
      prevReached.current = reached;
      return () => clearTimeout(t);
    }
    prevReached.current = reached;
  }, [reached]);

  const locked = gated && !unlocked;
  const Glyph = locked ? Lock : Icon;
  const iconRem = CONFIG.beadSizeRem * CONFIG.iconScale;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${at}: ${title}`}
          onClick={() => setOpen((v) => !v)}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer"
          style={{
            left: `${leftPct}%`,
            width: `${CONFIG.beadSizeRem}rem`,
            height: `${CONFIG.beadSizeRem}rem`,
            // expose the pop peak scale to the keyframe
            ['--ms-pop-scale' as string]: String(CONFIG.popScale),
          }}
        >
          {/* Ripple ring (behind the bead), only while popping */}
          {popping && (
            <span
              className="milestone-ripple absolute inset-0 rounded-full"
              style={{
                background: CONFIG.rippleColor,
                animation: `milestone-ripple ${CONFIG.rippleDurationMs}ms ease-out`,
              }}
            />
          )}
          {/* Layer 1b — grey idle bead */}
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: CONFIG.beadIdleColor }}
          />
          {/* Layer 2b — red reached bead (fades/scales in on reach) */}
          <span
            className={`absolute inset-0 rounded-full ${popping ? 'milestone-pop' : ''}`}
            style={{
              background: CONFIG.beadReachedColor,
              opacity: reached ? 1 : 0,
              transform: reached ? 'scale(1)' : 'scale(0.5)',
              transition: popping
                ? undefined
                : `opacity ${CONFIG.reachedFillTransitionMs}ms ease-out, transform ${CONFIG.reachedFillTransitionMs}ms ease-out`,
              animation: popping ? `milestone-pop ${CONFIG.popDurationMs}ms ease-out` : undefined,
            }}
          />
          {/* Layer 3 — icon */}
          <span className="absolute inset-0 flex items-center justify-center">
            <Glyph
              style={{
                width: `${iconRem}rem`,
                height: `${iconRem}rem`,
                color: reached ? CONFIG.iconReachedColor : CONFIG.iconIdleColor,
              }}
              strokeWidth={CONFIG.iconStroke}
            />
          </span>
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
