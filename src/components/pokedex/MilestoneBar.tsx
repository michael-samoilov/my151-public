import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { MILESTONE_DEFS, DEX_TOTAL, type MilestoneFeature } from '@/lib/milestones';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal } from '@/components/ui/tooltip';
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
  widthMobileRem: 11,
  widthDesktopRem: 15.5,

  // Uniform grey border thickness wrapping the red everywhere.
  outlineRem: 0.27,

  // Red (progress) geometry. Grey = these + 2·outlineRem.
  trackRedRem: 0.46, // red fill thickness
  beadRedRem: 1.22, // red bead diameter
  startBeadRedRem: 0.68, // origin node (smaller than a milestone bead)

  // Colors. Grey is OPAQUE (mixed toward card, no alpha) so overlaps don't seam.
  greyColor: 'color-mix(in srgb, var(--color-muted-foreground) 32%, var(--color-card))',
  fillColor: 'var(--color-primary)',
  fillTransitionMs: 700,

  // Icons (sized relative to the RED bead so they never crowd the circle).
  iconScale: 0.59,
  iconStroke: 2.2,
  iconIdleColor: 'var(--color-primary-foreground)', // white before reached, too
  iconReachedColor: 'var(--color-primary-foreground)',

  // Optional hairline dividers flanking the bar, so the counter (left) and
  // page buttons (right) read as intentionally aligned around a framed bar.
  showDividers: false,
  dividerGapRem: 0.6,
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
    greyStart: cfg.startBeadRedRem + 2 * cfg.outlineRem,
    iconRem: cfg.beadRedRem * cfg.iconScale,
  };
}

// Milestone counts including the two ends (0 and 151), for the fill remap.
const STOPS = [0, 25, 50, 100, DEX_TOTAL];

/**
 * Fill fraction (0..1) for a given count, with each milestone bead's footprint
 * skipped. `hw` = red-bead half-width as a fraction of the track. Between
 * milestones the fill runs to the NEXT bead's left edge; crossing a milestone
 * jumps it to that bead's right edge — so the first pick after a milestone
 * moves the fill visibly past the bead instead of hiding under it.
 */
function computeFillFraction(count: number, hw: number): number {
  const c = Math.max(0, Math.min(DEX_TOTAL, count));
  if (c <= 0) return 0;
  const fc = STOPS.map((s) => s / DEX_TOTAL);
  const lastSeg = STOPS.length - 2;
  let i = 0;
  while (i < lastSeg && c > STOPS[i + 1]) i++;
  const left = i === 0 ? 0 : fc[i] + hw; // resume past the bead just crossed
  const right = i === lastSeg ? 1 : fc[i + 1] - hw; // stop at next bead's edge
  const t = (c - STOPS[i]) / (STOPS[i + 1] - STOPS[i]);
  return Math.min(1, Math.max(0, left + t * (right - left)));
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
  analytics: { dx: 0.065, dy: -0.104 },
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

export function MilestoneBar() {
  const sections = usePokedexStore((s) => s.sections);
  const storeMax = usePokedexStore((s) => s.milestoneMax);
  const realCount = useMemo(
    () => Object.values(sections).reduce((sum, ids) => sum + ids.length, 0),
    [sections],
  );

  const cfg = useBarConfig();
  const d = deriveDims(cfg);
  const preview = usePreviewCount();
  const isDesktop = useIsDesktop();

  const count = TUNE && preview !== null ? preview : realCount;
  const milestoneMax = TUNE && preview !== null ? Math.max(storeMax, preview) : storeMax;

  // Red-bead half-width as a fraction of the track (rootFontSize cancels since
  // both bead and track are in rem), used to skip bead footprints in the fill.
  const trackWidthRem = isDesktop ? cfg.widthDesktopRem : cfg.widthMobileRem;
  const hw = cfg.beadRedRem / 2 / trackWidthRem;
  const fillPct = computeFillFraction(count, hw) * 100;

  const centerY = 'top-1/2 -translate-y-1/2';
  const centerXY = 'top-1/2 -translate-x-1/2 -translate-y-1/2';

  return (
    <div
      className="milestone-bar select-none relative"
      style={{
        ['--ms-w-mobile' as string]: `${cfg.widthMobileRem}rem`,
        ['--ms-w-desktop' as string]: `${cfg.widthDesktopRem}rem`,
      }}
    >
      {cfg.showDividers && (
        <>
          <div
            className={`absolute ${centerY}`}
            style={{ left: `${-cfg.dividerGapRem}rem`, width: '1px', height: `${d.greyBead}rem`, background: cfg.dividerColor }}
          />
          <div
            className={`absolute ${centerY}`}
            style={{ right: `${-cfg.dividerGapRem}rem`, width: '1px', height: `${d.greyBead}rem`, background: cfg.dividerColor }}
          />
        </>
      )}

      <div className="relative" style={{ height: `${d.greyBead}rem` }}>
        {/* ── Layer 1: grey (opaque) — runway to 151 + idle beads ── */}
        <div
          className={`absolute left-0 right-0 rounded-full ${centerY}`}
          style={{ height: `${d.greyTrack}rem`, background: cfg.greyColor }}
        />
        <div
          className={`absolute rounded-full ${centerXY}`}
          style={{ left: '0%', width: `${d.greyStart}rem`, height: `${d.greyStart}rem`, background: cfg.greyColor }}
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
            style={{ left: '0%', width: `${cfg.startBeadRedRem}rem`, height: `${cfg.startBeadRedRem}rem`, background: cfg.fillColor }}
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
            unlocked={milestoneMax >= m.at}
            gated={GATED[m.feature]}
            feature={m.feature}
            title={m.title}
            detail={m.detail}
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
  unlocked,
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
  unlocked: boolean;
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
  const locked = gated && !unlocked;
  const Glyph = locked ? Lock : FEATURE_ICON[feature];
  // Shift the glyph so its ink centroid — not its bounding box — sits at the
  // bead center (offsets are geometry-derived; see OPTICAL_OFFSET).
  const off = locked ? OPTICAL_OFFSET.lock : OPTICAL_OFFSET[feature];

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
        <TooltipContent side="bottom" className="z-[200] max-w-[13rem] text-center">
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
  { key: 'startBeadRedRem', min: 0.2, max: 1.0, step: 0.02, label: 'start knob (red)' },
  { key: 'iconScale', min: 0.3, max: 0.9, step: 0.01, label: 'icon scale' },
  { key: 'iconStroke', min: 1, max: 3.5, step: 0.1, label: 'icon stroke' },
  { key: 'dividerGapRem', min: 0.2, max: 1.5, step: 0.05, label: 'divider gap' },
  { key: 'widthMobileRem', min: 8, max: 16, step: 0.5, label: 'width (mobile)' },
  { key: 'widthDesktopRem', min: 10, max: 20, step: 0.5, label: 'width (desktop)' },
  { key: 'fillTransitionMs', min: 0, max: 1200, step: 50, label: 'fill glide (ms)' },
  { key: 'popScale', min: 1, max: 2, step: 0.05, label: 'pop scale' },
  { key: 'popDurationMs', min: 100, max: 1000, step: 20, label: 'pop (ms)' },
  { key: 'rippleDurationMs', min: 100, max: 1200, step: 20, label: 'ripple (ms)' },
];

export function MilestoneTunePanel() {
  const overrides = useSyncExternalStore(tuneStore.subscribe, tuneStore.overrides, tuneStore.overrides);
  const preview = usePreviewCount();
  const [copied, setCopied] = useState(false);
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
    <div className="fixed z-[100] left-3 right-3 bottom-3 max-h-[50vh] md:left-auto md:right-3 md:w-64 md:max-h-[80vh] overflow-y-auto rounded-lg border bg-card/95 backdrop-blur shadow-xl p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">MilestoneBar · tune</span>
        <button type="button" onClick={() => tuneStore.reset()} className="text-muted-foreground hover:text-foreground underline">
          reset
        </button>
      </div>

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
    </div>
  );
}
