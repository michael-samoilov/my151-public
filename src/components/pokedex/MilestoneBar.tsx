import { useState, useSyncExternalStore } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { DEX_TOTAL, milestonesAtOrBelow } from '@/lib/milestones';
import { BUILD_GROUPS, createEmptySections } from '@/data/slot-template';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { ChevronDown } from 'lucide-react';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';

const DEFAULT_CONFIG = {
  outlineRem: 0.15,

  trackRedRem: 0.36,
  beadRedRem: 0.88,

  greyColor: 'color-mix(in srgb, var(--color-muted-foreground) 32%, var(--color-card))',
  fillColor: 'var(--color-primary)',
  fillTransitionMs: 100,

  iconScale: 0.65,
  iconStroke: 2.5,
  iconIdleColor: 'var(--color-primary-foreground)',
  iconReachedColor: 'var(--color-primary-foreground)',

  showDividers: true,
  barInsetRem: 0.95,
  dividerColor: 'color-mix(in srgb, var(--color-muted-foreground) 38%, var(--color-card))',

  popScale: 1.4,
  popDurationMs: 440,
  rippleDurationMs: 560,
  rippleColor: 'var(--color-primary)',
};

type BarConfig = typeof DEFAULT_CONFIG;
type NumericKey = {
  [K in keyof BarConfig]: BarConfig[K] extends number ? K : never;
}[keyof BarConfig];

const TUNE = (() => {
  if (PRODUCTION_DEPLOY) return false;
  try {
    return new URLSearchParams(window.location.search).has('tune');
  } catch {
    return false;
  }
})();

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
    <div
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
