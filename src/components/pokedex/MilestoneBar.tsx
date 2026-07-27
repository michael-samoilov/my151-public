import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { t } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { MILESTONE_DEFS, MILESTONES, DEX_TOTAL, milestonesAtOrBelow, type MilestoneFeature } from '@/lib/milestones';
import { BUILD_GROUPS, createEmptySections } from '@/data/slot-template';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Sparkles, Trophy, ChevronDown, type LucideIcon } from 'lucide-react';

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
 * The fill tracks the CURRENT count but SKIPS each red bead's footprint (see
 * computeFillFraction), so the very next pick after a milestone visibly jumps
 * the fill past the bead instead of hiding under it. A bead's unlocked glyph
 * tracks the sticky `milestoneMax`. Placed absolutely-centered in the n/151
 * header by its parent, so it never shifts as page buttons differ.
 *
 * Tuning: append `?tune` for a dev-only slider panel (MilestoneTunePanel,
 * mounted in App). Copy its values back into DEFAULT_CONFIG when happy.
 */

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_CONFIG — every visual knob. Sizes are in rem. Grey sizes are DERIVED:
// red + 2·outlineRem.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  // The bar fills the available space between the counter and the page controls
  // (width:100% of its flex cell — see .milestone-bar in index.css). The measured
  // pixel width drives the fill-skip math, so the bar stays correct at any width.

  // Uniform grey border thickness wrapping the red everywhere.
  outlineRem: 0.15,

  // Red (progress) geometry. Grey = these + 2·outlineRem. The origin node is the
  // same size as a milestone bead.
  trackRedRem: 0.36, // red fill thickness
  beadRedRem: 0.88, // red bead diameter (also the origin node)

  // Colors. Grey is OPAQUE (mixed toward card, no alpha) so overlaps don't seam.
  greyColor: 'color-mix(in srgb, var(--color-muted-foreground) 32%, var(--color-card))',
  fillColor: 'var(--color-primary)',
  fillTransitionMs: 100,

  // Icons (sized relative to the RED bead so they never crowd the circle).
  iconScale: 0.65,
  iconStroke: 2.5,
  iconIdleColor: 'var(--color-primary-foreground)', // white before reached, too
  iconReachedColor: 'var(--color-primary-foreground)',

  // Hairline dividers flanking the bar so the counter (left) and page buttons
  // (right) read as intentionally aligned around a framed bar. They sit at the
  // bar's flex-cell edges (left:0 / right:0) — which the header pins at a fixed
  // --ms-side inset from both edges — so they're symmetric and never move. The
  // track is inset by barInsetRem so the bar's end beads stay inside the
  // dividers with a small visible gap (bead radius ≈ 0.71rem + a little space).
  showDividers: true,
  barInsetRem: 0.95,
  dividerColor: 'color-mix(in srgb, var(--color-muted-foreground) 38%, var(--color-card))',

  // Reach micro-interaction (one-time "pop" when a bead is first reached).
  popScale: 1.4,
  popDurationMs: 440,
  rippleDurationMs: 560,
  rippleColor: 'var(--color-primary)',
};

type BarConfig = typeof DEFAULT_CONFIG;
type NumericKey = {
  [K in keyof BarConfig]: BarConfig[K] extends number ? K : never;
}[keyof BarConfig];

function deriveDims(cfg: BarConfig) {
  return {
    greyTrack: cfg.trackRedRem + 2 * cfg.outlineRem,
    greyBead: cfg.beadRedRem + 2 * cfg.outlineRem,
    iconRem: cfg.beadRedRem * cfg.iconScale,
  };
}

/**
 * Fill fraction (0..1) for a given count, as a piecewise-linear curve through
 * explicit control points so each red circle's footprint is handled per-pick,
 * not by a linear breakpoint:
 *   • milestone − 1 → the circle's LEFT edge   (fill waits at the doorstep)
 *   • milestone     → the circle's CENTER       (reaching it fills to the middle)
 *   • milestone + 1 → the circle's RIGHT edge    (next pick clears the circle)
 * with straight interpolation between circles. The origin circle is cleared the
 * same way (its right edge by the first pick). `hw` = red-circle half-width as
 * a fraction of the track.
 */
function computeFillFraction(count: number, hw: number): number {
  const c = Math.max(0, Math.min(DEX_TOTAL, count));
  if (c <= 0) return 0;
  const pts: [number, number][] = [
    [0, 0],
    [1, hw], // clear the origin circle on the first pick
  ];
  for (const m of MILESTONES) {
    const f = m / DEX_TOTAL;
    if (m === DEX_TOTAL) {
      pts.push([m - 1, 1 - hw], [m, 1]); // no "+1" past the finish
    } else {
      pts.push([m - 1, f - hw], [m, f], [m + 1, f + hw]);
    }
  }
  pts.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [c0, f0] = pts[i];
    const [c1, f1] = pts[i + 1];
    if (c <= c1) {
      const t = (c - c0) / (c1 - c0);
      return Math.min(1, Math.max(0, f0 + t * (f1 - f0)));
    }
  }
  return 1;
}

const FEATURE_ICON: Record<MilestoneFeature, LucideIcon> = {
  analytics: BarChart3,
  view: Camera,
  stats: Sparkles,
  complete: Trophy,
};

/**
 * Optical-centering offsets (fraction of icon size) that move each glyph's ink
 * center-of-mass to the bead center — lucide icons are bounding-box-centered on
 * their 24-grid, but their visual *weight* isn't, so geometric centering reads
 * off. Values are measured, not hand-tuned: run `node
 * scripts/measure-icon-centroids.mjs` to regenerate if an icon changes.
 */
const OPTICAL_OFFSET: Record<MilestoneFeature | 'lock', { dx: number; dy: number }> = {
  // analytics: measured centroid, then nudged a hair down + left to taste.
  analytics: { dx: 0.02, dy: -0.06 },
  view: { dx: 0.002, dy: -0.034 },
  stats: { dx: 0.014, dy: -0.01 },
  complete: { dx: 0.002, dy: 0.014 },
  lock: { dx: 0.002, dy: -0.051 },
};

/** Which milestones gate a feature behind a lock (vs. a plain progress beat). */
const GATED: Record<MilestoneFeature, boolean> = {
  analytics: true,
  view: false,
  stats: true,
  complete: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Dev tuning store (?tune). A tiny shared external store so both header bars
// read the same live overrides. Inert in production (no overrides, no preview).
// ─────────────────────────────────────────────────────────────────────────────
const TUNE = (() => {
  try {
    return new URLSearchParams(window.location.search).has('tune');
  } catch {
    return false;
  }
})();

// Dev convenience: expose the store for console tinkering / test harnesses when
// tuning. Never present in production (TUNE is false without ?tune).
if (TUNE && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__pokedexStore = usePokedexStore;
}

let _overrides: Partial<BarConfig> = {};
let _preview: number | null = null;
const _subs = new Set<() => void>();
const _emit = () => _subs.forEach((f) => f());
const tuneStore = {
  subscribe(cb: () => void) {
    _subs.add(cb);
    return () => _subs.delete(cb);
  },
  overrides: () => _overrides,
  preview: () => _preview,
  set<K extends keyof BarConfig>(key: K, val: BarConfig[K]) {
    _overrides = { ..._overrides, [key]: val };
    _emit();
  },
  setPreview(v: number | null) {
    _preview = v;
    _emit();
  },
  reset() {
    _overrides = {};
    _preview = null;
    _emit();
  },
};

function useBarConfig(): BarConfig {
  const overrides = useSyncExternalStore(tuneStore.subscribe, tuneStore.overrides, tuneStore.overrides);
  return useMemo(() => ({ ...DEFAULT_CONFIG, ...overrides }), [overrides]);
}

function usePreviewCount(): number | null {
  return useSyncExternalStore(tuneStore.subscribe, tuneStore.preview, tuneStore.preview);
}

function useIsDesktop(): boolean {
  const [d, setD] = useState(() => {
    try {
      return window.matchMedia('(min-width: 1024px)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const h = (e: MediaQueryListEvent) => setD(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────

function MilestoneBarComponent() {
  const sections = usePokedexStore((s) => s.sections);
  const realCount = useMemo(
    () => Object.values(sections).reduce((sum, ids) => sum + ids.length, 0),
    [sections],
  );

  const cfg = useBarConfig();
  const d = deriveDims(cfg);
  const preview = usePreviewCount();
  const isDesktop = useIsDesktop();
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);

  // Defer count-driven visuals on mobile until the selection sheet closes, so
  // the fill slide + bead pops play where the user can actually see them rather
  // than under the open sheet. Desktop updates immediately; sheet-open holds the
  // last value. (?tune preview bypasses this and drives the count directly.)
  const [deferredCount, setDeferredCount] = useState(realCount);
  useEffect(() => {
    if (isDesktop || !mobileBrowserOpen) {
      // Small delay off the sheet close so the animation reads as arriving.
      const t = setTimeout(() => setDeferredCount(realCount), isDesktop ? 0 : 320);
      return () => clearTimeout(t);
    }
    // Sheet open on mobile: hold the previous value until it closes.
  }, [isDesktop, mobileBrowserOpen, realCount]);

  const count = TUNE && preview !== null ? preview : deferredCount;

  // Measure the rendered track width so the bead-footprint skip (hw) tracks the
  // actual pixel width the clamp() resolves to at this viewport — not a fixed
  // rem — keeping the fill-skip math correct as the bar grows on wider screens.
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      // Ignore zero-width reads: when this page is hidden (display:none) the bar
      // measures 0, which would recompute the fill fraction and then visibly
      // re-animate the width transition when the page is shown again. Keeping the
      // last real width means switching pages produces no change → no animation.
      setTrackPx((prev) => (w < 1 || Math.abs(prev - w) < 0.5 ? prev : w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Red-bead half-width as a fraction of the track. Convert the bead's rem to px
  // via the root font-size, then divide by the measured track px.
  const rootPx = (() => {
    try {
      return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    } catch {
      return 16;
    }
  })();
  const hw = trackPx > 0 ? (cfg.beadRedRem / 2) * rootPx / trackPx : 0;
  const fillPct = computeFillFraction(count, hw) * 100;

  const centerY = 'top-1/2 -translate-y-1/2';
  const centerXY = 'top-1/2 -translate-x-1/2 -translate-y-1/2';

  return (
    <div className="milestone-bar select-none relative">
      {cfg.showDividers && (
        <>
          <div
            className={`absolute ${centerY}`}
            style={{ left: 0, width: '1px', height: `${d.greyBead}rem`, background: cfg.dividerColor }}
          />
          <div
            className={`absolute ${centerY}`}
            style={{ right: 0, width: '1px', height: `${d.greyBead}rem`, background: cfg.dividerColor }}
          />
        </>
      )}

      {/* Track inset from the divider lines (which sit at the cell edges) so the
          end beads at 0%/151% stay inside the frame with a small gap. */}
      <div ref={trackRef} className="relative" style={{ height: `${d.greyBead}rem`, marginInline: `${cfg.barInsetRem}rem` }}>
        {/* ── Layer 1: grey (opaque) — runway to 151 + idle beads ── */}
        <div
          className={`absolute left-0 right-0 rounded-full ${centerY}`}
          style={{ height: `${d.greyTrack}rem`, background: cfg.greyColor }}
        />
        <div
          className={`absolute rounded-full ${centerXY}`}
          style={{ left: '0%', width: `${d.greyBead}rem`, height: `${d.greyBead}rem`, background: cfg.greyColor }}
        />
        {MILESTONE_DEFS.map((m) => (
          <div
            key={`g-${m.at}`}
            className={`absolute rounded-full ${centerXY}`}
            style={{
              left: `${(m.at / DEX_TOTAL) * 100}%`,
              width: `${d.greyBead}rem`,
              height: `${d.greyBead}rem`,
              background: cfg.greyColor,
            }}
          />
        ))}

        {/* ── Layer 2: red — progress fill (footprint-skipping) + reached beads ── */}
        <div
          className={`absolute left-0 rounded-full ${centerY}`}
          style={{
            height: `${cfg.trackRedRem}rem`,
            width: `${fillPct.toFixed(3)}%`,
            background: cfg.fillColor,
            transition: `width ${cfg.fillTransitionMs}ms ease-out`,
          }}
        />
        {count > 0 && (
          <div
            className={`absolute rounded-full ${centerXY}`}
            style={{ left: '0%', width: `${cfg.beadRedRem}rem`, height: `${cfg.beadRedRem}rem`, background: cfg.fillColor }}
          />
        )}
        {MILESTONE_DEFS.map((m) => (
          <RedBead key={`r-${m.at}`} leftPct={(m.at / DEX_TOTAL) * 100} reached={count >= m.at} cfg={cfg} />
        ))}

        {/* ── Layer 3: icons + tooltip triggers (transparent hit targets) ── */}
        {MILESTONE_DEFS.map((m) => (
          <MilestoneTrigger
            key={`t-${m.at}`}
            at={m.at}
            leftPct={(m.at / DEX_TOTAL) * 100}
            reached={count >= m.at}
            gated={GATED[m.feature]}
            feature={m.feature}
            title={t(m.titleKey)}
            detail={t(m.detailKey)}
            remaining={Math.max(0, m.at - count)}
            cfg={cfg}
            greyBeadRem={d.greyBead}
            iconRem={d.iconRem}
          />
        ))}
      </div>
    </div>
  );
}

/** Memoized milestone bar to prevent re-animation on page switches.
 *  Since each page has its own instance, this ensures the bar only re-renders
 *  when its data (count, track width) actually changes, not on visibility toggles. */
export const MilestoneBar = memo(MilestoneBarComponent);

/** The red bead for a milestone (only rendered once reached). Pops + ripples the
 *  first time it flips to reached in-session; centering lives on the wrapper so
 *  the pop's scale never fights the translate. */
function RedBead({ leftPct, reached, cfg }: { leftPct: number; reached: boolean; cfg: BarConfig }) {
  const prev = useRef(reached);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (reached && !prev.current) {
      setPopping(true);
      const t = setTimeout(() => setPopping(false), cfg.rippleDurationMs);
      prev.current = reached;
      return () => clearTimeout(t);
    }
    prev.current = reached;
  }, [reached, cfg.rippleDurationMs]);

  if (!reached) return null;

  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%`, width: `${cfg.beadRedRem}rem`, height: `${cfg.beadRedRem}rem`, ['--ms-pop-scale' as string]: String(cfg.popScale) }}
    >
      {popping && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: cfg.rippleColor, animation: `milestone-ripple ${cfg.rippleDurationMs}ms ease-out` }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: cfg.fillColor, animation: popping ? `milestone-pop ${cfg.popDurationMs}ms ease-out` : undefined }}
      />
    </div>
  );
}

function MilestoneTrigger({
  at,
  leftPct,
  reached,
  gated,
  feature,
  title,
  detail,
  remaining,
  cfg,
  greyBeadRem,
  iconRem,
}: {
  at: number;
  leftPct: number;
  reached: boolean;
  gated: boolean;
  feature: MilestoneFeature;
  title: string;
  detail: string;
  remaining: number;
  cfg: BarConfig;
  greyBeadRem: number;
  iconRem: number;
}) {
  const [open, setOpen] = useState(false);
  const Glyph = FEATURE_ICON[feature];
  // Shift the glyph so its ink centroid — not its bounding box — sits at the
  // bead center (offsets are geometry-derived; see OPTICAL_OFFSET).
  const off = OPTICAL_OFFSET[feature];

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${at}: ${title}`}
          onClick={() => setOpen((v) => !v)}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer"
          style={{ left: `${leftPct}%`, width: `${greyBeadRem}rem`, height: `${greyBeadRem}rem` }}
        >
          <Glyph
            style={{
              width: `${iconRem}rem`,
              height: `${iconRem}rem`,
              color: reached ? cfg.iconReachedColor : cfg.iconIdleColor,
              transform: `translate(${(off.dx * iconRem).toFixed(4)}rem, ${(off.dy * iconRem).toFixed(4)}rem)`,
            }}
            strokeWidth={cfg.iconStroke}
          />
        </button>
      </TooltipTrigger>
      {/* Portaled + high z so the popup floats above app body elements. */}
      <TooltipPortal>
        {/* border-0: the content's border would draw a seam across the arrow's
            base; drop it and lean on the shadow so the arrow reads as one piece. */}
        <TooltipContent side="bottom" className="z-[200] max-w-[13rem] text-center border-0 shadow-lg">
          <TooltipArrow />
          <div className="font-semibold text-xs">
            {at} · {title}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {reached ? detail : `${remaining} more to ${gated ? 'unlock' : 'reach'}.`}
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only tuning panel. Renders nothing unless the URL has ?tune.
// ─────────────────────────────────────────────────────────────────────────────

const TUNABLES: { key: NumericKey; min: number; max: number; step: number; label: string }[] = [
  { key: 'outlineRem', min: 0.02, max: 0.4, step: 0.01, label: 'outline (grey border)' },
  { key: 'trackRedRem', min: 0.1, max: 0.6, step: 0.01, label: 'track (red fill)' },
  { key: 'beadRedRem', min: 0.5, max: 1.6, step: 0.02, label: 'bead (red)' },
  { key: 'iconScale', min: 0.3, max: 0.9, step: 0.01, label: 'icon scale' },
  { key: 'iconStroke', min: 1, max: 3.5, step: 0.1, label: 'icon stroke' },
  { key: 'barInsetRem', min: 0.5, max: 1.6, step: 0.05, label: 'bar inset (bead↔divider)' },
  { key: 'fillTransitionMs', min: 0, max: 1200, step: 50, label: 'fill glide (ms)' },
  { key: 'popScale', min: 1, max: 2, step: 0.05, label: 'pop scale' },
  { key: 'popDurationMs', min: 100, max: 1000, step: 20, label: 'pop (ms)' },
  { key: 'rippleDurationMs', min: 100, max: 1200, step: 20, label: 'ripple (ms)' },
];

/** Dev seed: fill the store to `n` Pokémon from the demo dex (whole ids in
 *  build order) and mark milestones at/below `n` as already-celebrated, so the
 *  next crossing fires its celebration once — lets you rehearse each milestone
 *  and the 151 confetti from just below it. */
function seedDex(n: number) {
  const sections = createEmptySections();
  let c = 0;
  for (const g of BUILD_GROUPS) {
    const ids = DEMO_DEX_SECTIONS[g.id];
    if (!ids?.length) continue;
    const take: number[] = [];
    for (const id of ids) {
      if (c >= n) break;
      take.push(id);
      c++;
    }
    if (take.length) sections[g.id] = take;
    if (c >= n) break;
  }
  usePokedexStore.setState({
    sections,
    milestoneMax: n,
    milestoneCelebrated: milestonesAtOrBelow(n),
    milestoneCelebration: null,
  });
}

export function MilestoneTunePanel() {
  const overrides = useSyncExternalStore(tuneStore.subscribe, tuneStore.overrides, tuneStore.overrides);
  const preview = usePreviewCount();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  if (!TUNE) return null;

  const cfg: BarConfig = { ...DEFAULT_CONFIG, ...overrides };

  const copy = () => {
    const lines = [
      ...TUNABLES.map(({ key }) => `  ${key}: ${cfg[key]},`),
      `  showDividers: ${cfg.showDividers},`,
    ].join('\n');
    void navigator.clipboard?.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    // Collapsed, dock to the left as an auto-width pill so the centered
    // "add pokemon" button stays clickable beneath it; expanded, span the width
    // as a bottom sheet. Desktop keeps it pinned to the right in both states.
    <div
      className={`fixed z-[100] bottom-3 ${
        collapsed ? 'left-3 w-auto max-w-[calc(100vw-1.5rem)]' : 'left-3 right-3 max-h-[50vh]'
      } md:left-auto md:right-3 md:w-64 md:max-h-[80vh] overflow-y-auto rounded-lg border bg-card/95 backdrop-blur shadow-xl p-3 text-xs`}
    >
      <div className={`flex items-center justify-between gap-4 ${collapsed ? '' : 'mb-2'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1 font-semibold cursor-pointer"
          aria-expanded={!collapsed}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          MilestoneBar · tune
        </button>
        <button type="button" onClick={() => tuneStore.reset()} className="text-muted-foreground hover:text-foreground underline">
          reset
        </button>
      </div>

      {!collapsed && (
      <>
      {/* Preview count scrubber */}
      <label className="block mb-3">
        <div className="flex justify-between text-muted-foreground">
          <span>preview count</span>
          <span className="tabular-nums">{preview === null ? 'live' : preview}</span>
        </div>
        <input
          type="range"
          min={0}
          max={DEX_TOTAL}
          step={1}
          value={preview ?? 0}
          onChange={(e) => tuneStore.setPreview(Number(e.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <button type="button" onClick={() => tuneStore.setPreview(null)} className="text-muted-foreground hover:text-foreground underline">
          use live count
        </button>
      </label>

      {/* Milestone rehearsal — seed the dex just below a milestone, then add
          Pokémon in the app to cross it and see the celebration/confetti. */}
      <div className="mb-3">
        <div className="text-muted-foreground mb-1">seed dex (then build up)</div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { n: 24, label: '24' },
            { n: 99, label: '99' },
            { n: 140, label: '140' },
            { n: 0, label: 'clear' },
          ].map(({ n, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => seedDex(n)}
              className="rounded-md border py-1 hover:bg-muted transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dividers toggle */}
      <label className="flex items-center justify-between mb-3 cursor-pointer">
        <span>hairline dividers</span>
        <input
          type="checkbox"
          checked={cfg.showDividers}
          onChange={(e) => tuneStore.set('showDividers', e.target.checked)}
          className="accent-[var(--color-primary)]"
        />
      </label>

      <div className="space-y-2.5">
        {TUNABLES.map(({ key, min, max, step, label }) => (
          <label key={key} className="block">
            <div className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums text-muted-foreground">{cfg[key]}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={cfg[key]}
              onChange={(e) => tuneStore.set(key, Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={copy}
        className="mt-3 w-full rounded-md bg-primary text-primary-foreground py-1.5 font-medium"
      >
        {copied ? 'copied ✓' : 'copy values'}
      </button>
      </>
      )}
    </div>
  );
}
