import { useState, useSyncExternalStore } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { DEX_TOTAL, milestonesAtOrBelow } from '@/lib/milestones';
import { BUILD_GROUPS, createEmptySections } from '@/data/slot-template';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { ChevronDown } from 'lucide-react';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';

/**
 * The dev tuning panel of the retired milestone progress bar. The header now
 * carries the count alone, so no bar renders.
 *
 * Append `?tune` on a local build or a preview for the panel
 * (MilestoneTunePanel, mounted in App). Its dex seed and the
 * `window.__pokedexStore` handle are what the E2E fixtures use.
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

// ─────────────────────────────────────────────────────────────────────────────
// Dev tuning store (?tune). A tiny shared external store so both header bars
// read the same live overrides. The production deploy ignores ?tune, so the
// panel and the store handle below exist only on local builds and previews.
// ─────────────────────────────────────────────────────────────────────────────
const TUNE = (() => {
  if (PRODUCTION_DEPLOY) return false;
  try {
    return new URLSearchParams(window.location.search).has('tune');
  } catch {
    return false;
  }
})();

// Dev convenience: expose the store for console tinkering / test harnesses when
// tuning. Never present in production (TUNE is always false there).
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

function usePreviewCount(): number | null {
  return useSyncExternalStore(tuneStore.subscribe, tuneStore.preview, tuneStore.preview);
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
      // Dev-only tuning panel (?tune). Its labels are never translated, and the
      // extraction-coverage check keys off this attribute to say so.
      data-i18n-exempt="dev-tools"
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
