import { useEffect, useMemo, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { MILESTONE_DEFS, DEX_TOTAL, type MilestoneFeature } from '@/lib/milestones';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { BarChart3, Camera, Sparkles, Trophy, Lock, type LucideIcon } from 'lucide-react';

/**
 * The milestone progress spine — a slim runway with a bead at each milestone
 * (25/50/100/151). The look is a red progress shape (fill line + reached beads)
 * wrapped by a UNIFORM grey border: grey is drawn thicker/bigger than red by
 * `outlineRem` on every side, so it reads as a consistent outline around the
 * red — and the runway (grey) always extends the full width to 151.
 *
 * Paint order is strict — all grey, then all red, then icons — and every grey
 * is fully OPAQUE (blended toward the card color, not alpha), so overlapping
 * grey track + grey beads never compound into visible seams.
 *
 * The fill tracks the CURRENT count; a bead's unlocked glyph tracks the sticky
 * `milestoneMax`. Placed absolutely-centered in the n/151 header by its parent,
 * so it never shifts as page-specific buttons differ.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — every visual knob in one place. Sizes are in rem (scale with the
// app's root font-size). Grey sizes are DERIVED: red + 2·outlineRem.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  widthMobileRem: 11,
  widthDesktopRem: 15.5,

  // Uniform grey border thickness wrapping the red everywhere.
  outlineRem: 0.14,

  // Red (progress) geometry. Grey = these + 2·outlineRem.
  trackRedRem: 0.26, // red fill thickness
  beadRedRem: 0.9, // red bead diameter

  // Colors. Grey is OPAQUE (mixed toward card, no alpha) so overlaps don't seam.
  greyColor: 'color-mix(in srgb, var(--color-muted-foreground) 32%, var(--color-card))',
  fillColor: 'var(--color-primary)',
  fillTransitionMs: 550, // red fill glide as count changes

  // Icons (sized relative to the RED bead so they never crowd the circle).
  iconScale: 0.62,
  iconStroke: 2.5,
  iconIdleColor: 'var(--color-muted-foreground)',
  iconReachedColor: 'var(--color-primary-foreground)',

  // Reach micro-interaction (one-time "pop" when a bead is first reached).
  popScale: 1.4,
  popDurationMs: 440,
  rippleDurationMs: 560,
  rippleColor: 'var(--color-primary)',
} as const;

// Derived grey geometry — grey reads as a uniform border around the red.
const GREY_TRACK_REM = CONFIG.trackRedRem + 2 * CONFIG.outlineRem;
const GREY_BEAD_REM = CONFIG.beadRedRem + 2 * CONFIG.outlineRem;
const ICON_REM = CONFIG.beadRedRem * CONFIG.iconScale;

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

  const centerY = 'top-1/2 -translate-y-1/2';
  const centerXY = 'top-1/2 -translate-x-1/2 -translate-y-1/2';

  return (
    <div
      className="milestone-bar select-none"
      style={{
        ['--ms-w-mobile' as string]: `${CONFIG.widthMobileRem}rem`,
        ['--ms-w-desktop' as string]: `${CONFIG.widthDesktopRem}rem`,
      }}
    >
      <div className="relative" style={{ height: `${GREY_BEAD_REM}rem` }}>
        {/* ── Layer 1: grey (opaque) — runway to 151 + idle beads ── */}
        <div
          className={`absolute left-0 right-0 rounded-full ${centerY}`}
          style={{ height: `${GREY_TRACK_REM}rem`, background: CONFIG.greyColor }}
        />
        {MILESTONE_DEFS.map((m) => (
          <div
            key={`g-${m.at}`}
            className={`absolute rounded-full ${centerXY}`}
            style={{
              left: `${(m.at / DEX_TOTAL) * 100}%`,
              width: `${GREY_BEAD_REM}rem`,
              height: `${GREY_BEAD_REM}rem`,
              background: CONFIG.greyColor,
            }}
          />
        ))}

        {/* ── Layer 2: red — progress fill + reached beads ── */}
        <div
          className={`absolute left-0 rounded-full ${centerY}`}
          style={{
            height: `${CONFIG.trackRedRem}rem`,
            width: `${pct}%`,
            background: CONFIG.fillColor,
            transition: `width ${CONFIG.fillTransitionMs}ms ease-out`,
          }}
        />
        {MILESTONE_DEFS.map((m) => (
          <RedBead
            key={`r-${m.at}`}
            leftPct={(m.at / DEX_TOTAL) * 100}
            reached={count >= m.at}
          />
        ))}

        {/* ── Layer 3: icons + tooltip triggers (transparent hit targets) ── */}
        {MILESTONE_DEFS.map((m) => (
          <MilestoneTrigger
            key={`t-${m.at}`}
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

/** The red bead for a milestone (only rendered once reached). Pops + ripples the
 *  first time it flips to reached in-session; centering lives on the wrapper so
 *  the pop's scale never fights the translate. */
function RedBead({ leftPct, reached }: { leftPct: number; reached: boolean }) {
  const prev = useRef(reached);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (reached && !prev.current) {
      setPopping(true);
      const t = setTimeout(() => setPopping(false), CONFIG.rippleDurationMs);
      prev.current = reached;
      return () => clearTimeout(t);
    }
    prev.current = reached;
  }, [reached]);

  if (!reached) return null;

  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, width: `${CONFIG.beadRedRem}rem`, height: `${CONFIG.beadRedRem}rem`, ['--ms-pop-scale' as string]: String(CONFIG.popScale) }}
    >
      {popping && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: CONFIG.rippleColor, animation: `milestone-ripple ${CONFIG.rippleDurationMs}ms ease-out` }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: CONFIG.fillColor, animation: popping ? `milestone-pop ${CONFIG.popDurationMs}ms ease-out` : undefined }}
      />
    </div>
  );
}

function MilestoneTrigger({
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
  const locked = gated && !unlocked;
  const Glyph = locked ? Lock : Icon;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${at}: ${title}`}
          onClick={() => setOpen((v) => !v)}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer"
          style={{ left: `${leftPct}%`, width: `${GREY_BEAD_REM}rem`, height: `${GREY_BEAD_REM}rem` }}
        >
          <Glyph
            style={{
              width: `${ICON_REM}rem`,
              height: `${ICON_REM}rem`,
              color: reached ? CONFIG.iconReachedColor : CONFIG.iconIdleColor,
            }}
            strokeWidth={CONFIG.iconStroke}
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
