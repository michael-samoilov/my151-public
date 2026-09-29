import { useEffect, useMemo, useState } from 'react';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { EXPORT_OVERLAY_SCRIM_CLASS, EXPORT_OVERLAY_SCRIM_STYLE } from '@/components/export/exportOverlayScrim';
import { KANTO_LEAGUE_NAME, kantoCards } from '@/league/data/kantoLeague';
import { exportGymCard, exportLeagueHome } from '@/league/export/exportLeague';
import { DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT } from '@/league/export/exportOptions';
import {
  DEFAULT_FOIL_RECIPE,
  FOIL_WORKSHOP_STORAGE_KEY,
  cloneFoilRecipe,
  foilRecipeSearch,
  parseFoilRecipe,
  parseFoilRecipeFromSearch,
  withFoilLayer,
  type FoilRecipe,
} from '@/league/export/foilRecipe';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { generateExportImage } from '@/lib/exportImage';
import { computeAnalytics } from '@/hooks/useAnalytics';
import { detailedStatsData } from '@/components/view/useDetailedStatsData';
import { DEFAULT_STATS_HEIGHTS } from '@/components/view/DetailedStatsPanel';
import { renderFoilTestCard } from './testCard';
import {
  DEFAULT_HOVER_TILT_RECIPE,
  HOVER_TILT_WORKSHOP_STORAGE_KEY,
  cloneHoverTiltRecipe,
  hoverTiltSearch,
  parseHoverTiltRecipe,
  parseHoverTiltRecipeFromSearch,
  type HoverTiltRecipe,
} from '@/components/export/hoverTiltRecipe';
import {
  EMPTY_MASK_CONTEXT,
  hoverTiltMaskContextFromDex,
  type HoverTiltMaskContext,
} from '@/components/export/hoverTiltMasks';

const WORKSHOP_DEX_SECTIONS: Record<string, number[]> = {
  starter: DEMO_DEX_SECTIONS.starter,
  'early-bug': DEMO_DEX_SECTIONS['early-bug'],
  'pikachu-clone': DEMO_DEX_SECTIONS['pikachu-clone'],
  legendary: DEMO_DEX_SECTIONS.legendary,
  mythical: DEMO_DEX_SECTIONS.mythical,
};

/** Every Kanto Pokémon, placed: the fully filled Dex. */
const FULL_DEX_SECTIONS: Record<string, number[]> = {
  other: Array.from({ length: 151 }, (_, i) => i + 1),
};

const WORKSHOP_SAMPLES = [
  { id: 'dex', label: 'Dex export' },
  { id: 'dex-full', label: 'Dex, all 151' },
  { id: 'dex-stats', label: 'Dex, 151 + stats' },
  { id: 'league', label: 'League export' },
  { id: 'league-full', label: 'League, filled' },
  { id: 'league-both', label: 'League, story + rematch' },
  { id: 'trainer', label: 'Trainer card' },
  { id: 'test', label: 'Test card' },
] as const;

type WorkshopSample = (typeof WORKSHOP_SAMPLES)[number]['id'];

function isWorkshopSample(value: string | null): value is WorkshopSample {
  return WORKSHOP_SAMPLES.some((s) => s.id === value);
}

function sampleDexSections(sample: WorkshopSample): Record<string, number[]> | null {
  if (sample === 'dex') return WORKSHOP_DEX_SECTIONS;
  if (sample === 'dex-full' || sample === 'dex-stats') return FULL_DEX_SECTIONS;
  return null;
}

function renderSample(sample: WorkshopSample): Promise<Blob> {
  const dex = sampleDexSections(sample);
  if (dex) {
    const stats =
      sample === 'dex-stats'
        ? { data: detailedStatsData(dex, computeAnalytics(dex)), heights: DEFAULT_STATS_HEIGHTS }
        : null;
    return generateExportImage(getPokemonByIds(Object.values(dex).flat()), { sections: dex, stats });
  }
  if (sample === 'trainer') return exportGymCard(kantoCards({ full: true })[12]);
  if (sample === 'test') return renderFoilTestCard();
  const full = sample !== 'league';
  const layout =
    sample === 'league-both'
      ? { ...DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT, teamMode: 'both' as const }
      : DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT;
  return exportLeagueHome(KANTO_LEAGUE_NAME, kantoCards({ full }), 'challenge', layout);
}

function sampleMaskContext(sample: WorkshopSample): HoverTiltMaskContext {
  const dex = sampleDexSections(sample);
  if (!dex) return EMPTY_MASK_CONTEXT;
  return hoverTiltMaskContextFromDex(getPokemonByIds(Object.values(dex).flat()), dex);
}

/**
 * Keep only the dials this page shows; the rest are the export's defaults.
 * A recipe saved by an older workshop kept values it can no longer show,
 * such as no pop (scaleFactor 1) or an auto-tilt smaller than max tilt.
 */
/** Foil layers the page has dials for. */
const WORKSHOP_LAYERS = ['holographic', 'holoRainbow', 'pointLight', 'iridescence'] as const;

function workshopFoil(saved: FoilRecipe): FoilRecipe {
  const next = cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
  for (const id of WORKSHOP_LAYERS) next.layers[id] = { ...saved.layers[id] };
  next.maxTilt = saved.maxTilt;
  next.idleTilt = saved.maxTilt;
  return next;
}

function workshopTilt(saved: HoverTiltRecipe): HoverTiltRecipe {
  return {
    ...cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE),
    glareIntensity: saved.glareIntensity,
    glareSize: saved.glareSize,
    shadow: saved.shadow,
    shadowBlur: saved.shadowBlur,
  };
}

function readStoredFoil(): FoilRecipe {
  const params = new URLSearchParams(window.location.search);
  if (params.has('r')) return workshopFoil(parseFoilRecipeFromSearch(window.location.search));
  try {
    const stored = localStorage.getItem(FOIL_WORKSHOP_STORAGE_KEY);
    if (stored) return workshopFoil(parseFoilRecipe(JSON.parse(stored) as unknown));
  } catch {
    /* quota or private mode */
  }
  return cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
}

function readStoredTilt(): HoverTiltRecipe {
  const params = new URLSearchParams(window.location.search);
  if (params.has('t')) return workshopTilt(parseHoverTiltRecipeFromSearch(window.location.search));
  try {
    const stored = localStorage.getItem(HOVER_TILT_WORKSHOP_STORAGE_KEY);
    if (stored) return workshopTilt(parseHoverTiltRecipe(JSON.parse(stored) as unknown));
  } catch {
    /* quota or private mode */
  }
  return cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE);
}

function readStoredSample(): WorkshopSample {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('sample');
  return isWorkshopSample(fromUrl) ? fromUrl : 'dex';
}

function persistWorkshop(
  recipe: FoilRecipe,
  tilt: HoverTiltRecipe,
  sample: WorkshopSample,
): void {
  const qs = `${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}`;
  window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  try {
    localStorage.setItem(FOIL_WORKSHOP_STORAGE_KEY, JSON.stringify(recipe));
    localStorage.setItem(HOVER_TILT_WORKSHOP_STORAGE_KEY, JSON.stringify(tilt));
  } catch {
    /* quota or private mode */
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FoilWorkshopPage() {
  const [recipe, setRecipe] = useState<FoilRecipe>(readStoredFoil);
  const [tilt, setTilt] = useState<HoverTiltRecipe>(readStoredTilt);
  const [sample, setSample] = useState<WorkshopSample>(readStoredSample);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'link' | null>(null);
  const maskContext = useMemo(() => sampleMaskContext(sample), [sample]);

  const busy = src === null;
  const holo = recipe.layers.holographic;
  const rainbow = recipe.layers.holoRainbow;

  useEffect(() => {
    persistWorkshop(recipe, tilt, sample);
  }, [recipe, sample, tilt]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void renderSample(sample)
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        created = next;
        setSrc(next);
      })
      .catch((err: unknown) => {
        console.error('Foil workshop preview failed:', err);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [sample]);

  const flash = (kind: 'json' | 'link') => {
    setCopied(kind);
    window.setTimeout(() => setCopied((now) => (now === kind ? null : now)), 1600);
  };

  return (
    <div
      className="flex min-h-svh flex-col bg-zinc-950 text-zinc-100 md:h-svh md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:grid-rows-1"
      data-foil-workshop
      data-workshop-sample={sample}
    >
      <section className="relative h-[42svh] w-full shrink-0 overflow-hidden md:h-full" data-workshop-stage>
        <div
          className="absolute inset-0 overflow-hidden bg-background p-5"
          data-workshop-stage-page
          aria-hidden
        >
          <div className="grid h-full grid-cols-4 gap-3 md:grid-cols-6">
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="rounded-xl bg-card shadow-sm ring-1 ring-border" />
            ))}
          </div>
        </div>
        <div
          className={EXPORT_OVERLAY_SCRIM_CLASS}
          style={EXPORT_OVERLAY_SCRIM_STYLE}
          data-export-scrim
          data-workshop-overlay
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 text-[0.7rem] leading-snug text-zinc-200">
          <div>
            <h1 className="text-sm font-semibold text-zinc-50">Export foil workshop</h1>
            <p className="mt-0.5 hidden max-w-[42rem] md:block">
              Shine, rainbow, light, tilt, glare, and drop shadow. Live export defaults stay on the card.
            </p>
          </div>
          <a href="/custom-gym-leader" className="pointer-events-auto shrink-0 text-zinc-100 underline">
            League builder
          </a>
        </div>
        <div className="absolute inset-0 z-[1] px-3 pb-4 pt-12 md:px-10 md:pb-10 md:pt-16">
          <ExportPreview3D
            src={src}
            alt={`${WORKSHOP_SAMPLES.find((s) => s.id === sample)?.label ?? 'Export'} foil workshop`}
            busy={busy}
            recipe={recipe}
            tilt={tilt}
            maskContext={maskContext}
          />
        </div>
      </section>

      <aside className="max-h-[58svh] overflow-y-auto overscroll-contain border-t border-zinc-800 bg-zinc-900 md:max-h-none md:border-l md:border-t-0">
        <div className="space-y-4 p-3 pb-8">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-900"
              data-foil-copy-json
              onClick={() => {
                void copyText(JSON.stringify({ foil: recipe, tilt }, null, 2)).then((ok) => {
                  if (ok) flash('json');
                });
              }}
            >
              {copied === 'json' ? 'Copied JSON' : 'Copy JSON'}
            </button>
            <button
              type="button"
              className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100"
              data-foil-copy-link
              onClick={() => {
                const href = `${window.location.origin}${window.location.pathname}?${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}`;
                void copyText(href).then((ok) => {
                  if (ok) flash('link');
                });
              }}
            >
              {copied === 'link' ? 'Copied link' : 'Copy link'}
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-zinc-400 underline"
              data-foil-reset
              onClick={() => {
                setRecipe(cloneFoilRecipe(DEFAULT_FOIL_RECIPE));
                setTilt(cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE));
                setSample('dex');
              }}
            >
              Reset default
            </button>
          </div>

          <fieldset>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Sample
            </legend>
            <div className="grid grid-cols-2 gap-1">
              {WORKSHOP_SAMPLES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  data-workshop-sample-btn={id}
                  onClick={() => setSample(id)}
                  className={`rounded-md px-1 py-2 text-center text-[0.7rem] leading-tight ${
                    sample === id ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2" data-foil-control="holographic">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Shine
            </legend>
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={holo.on}
                data-foil-on="holographic"
                onChange={(e) => setRecipe(withFoilLayer(recipe, 'holographic', { on: e.target.checked }))}
              />
              Diagonal V shine on ink
            </label>
            <Slider
              label="Amount"
              min={0}
              max={1}
              step={0.01}
              value={holo.amount}
              testId="holographic"
              onChange={(amount) => setRecipe(withFoilLayer(recipe, 'holographic', { amount }))}
            />
          </fieldset>

          <fieldset className="space-y-2" data-foil-control="holoRainbow">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Rainbow
            </legend>
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={rainbow.on}
                data-foil-on="holoRainbow"
                onChange={(e) => setRecipe(withFoilLayer(recipe, 'holoRainbow', { on: e.target.checked }))}
              />
              Rainbow holofoil on ink
            </label>
            <Slider
              label="Amount"
              min={0}
              max={1}
              step={0.01}
              value={rainbow.amount}
              testId="holoRainbow"
              onChange={(amount) => setRecipe(withFoilLayer(recipe, 'holoRainbow', { amount }))}
            />
          </fieldset>

          <LayerDial
            id="pointLight"
            title="Point light"
            toggle="Soft light disc at the tilt"
            recipe={recipe}
            onRecipe={setRecipe}
          />
          <LayerDial
            id="iridescence"
            title="Iridescence"
            toggle="Hue of colored ink shifts with the tilt"
            recipe={recipe}
            onRecipe={setRecipe}
          />

          <fieldset className="space-y-2" data-foil-control="maxTilt">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Tilt
            </legend>
            <Slider
              label="Max tilt"
              min={1}
              max={20}
              step={0.5}
              value={recipe.maxTilt}
              suffix="°"
              testId="maxTilt"
              onChange={(deg) => setRecipe({ ...recipe, maxTilt: deg, idleTilt: deg })}
            />
          </fieldset>

          <fieldset className="space-y-2" data-hover-tilt-knobs>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Glare
            </legend>
            <Slider
              label="Intensity"
              min={0}
              max={1}
              step={0.01}
              value={tilt.glareIntensity}
              testId="glareIntensity"
              onChange={(glareIntensity) => setTilt({ ...tilt, glareIntensity })}
            />
            <Slider
              label="Size"
              min={0.2}
              max={1}
              step={0.01}
              value={tilt.glareSize}
              testId="glareSize"
              onChange={(glareSize) => setTilt({ ...tilt, glareSize })}
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Drop shadow
            </legend>
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={tilt.shadow}
                data-workshop-shadow-toggle
                onChange={(e) => setTilt({ ...tilt, shadow: e.target.checked })}
              />
              Drop shadow
            </label>
            <Slider
              label="Blur"
              min={0}
              max={80}
              step={1}
              value={tilt.shadowBlur}
              suffix=" px"
              testId="shadowBlur"
              onChange={(shadowBlur) => setTilt({ ...tilt, shadowBlur })}
            />
          </fieldset>
        </div>
      </aside>
    </div>
  );
}

function LayerDial({
  id,
  title,
  toggle,
  recipe,
  onRecipe,
}: {
  id: 'pointLight' | 'iridescence';
  title: string;
  toggle: string;
  recipe: FoilRecipe;
  onRecipe: (next: FoilRecipe) => void;
}) {
  const layer = recipe.layers[id];
  return (
    <fieldset className="space-y-2" data-foil-control={id}>
      <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">{title}</legend>
      <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
        <input
          type="checkbox"
          checked={layer.on}
          data-foil-on={id}
          onChange={(e) => onRecipe(withFoilLayer(recipe, id, { on: e.target.checked }))}
        />
        {toggle}
      </label>
      <Slider
        label="Amount"
        min={0}
        max={1}
        step={0.01}
        value={layer.amount}
        testId={id}
        onChange={(amount) => onRecipe(withFoilLayer(recipe, id, { amount }))}
      />
    </fieldset>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix = '',
  testId,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  testId: string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isInteger(step) && step >= 1 ? value.toFixed(0) : value.toFixed(2);
  return (
    <label className="mt-1 block text-[0.7rem] text-zinc-400">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">
          {shown}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-foil-slider={testId}
        className="mt-1 w-full"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
