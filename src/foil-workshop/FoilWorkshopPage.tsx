import { useEffect, useMemo, useState } from 'react';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { EXPORT_OVERLAY_SCRIM_CLASS, EXPORT_OVERLAY_SCRIM_STYLE } from '@/components/export/exportOverlayScrim';
import { KANTO_LEAGUE_NAME, kantoCards } from '@/league/data/kantoLeague';
import { exportLeagueHome } from '@/league/export/exportLeague';
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
import {
  FOIL_HOLO_BLEND,
  FOIL_HOLO_BLEND_CANDIDATES,
  isFoilHoloBlend,
  type FoilHoloBlend,
} from '@/league/export/foilBlend';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { generateExportImage } from '@/lib/exportImage';
import {
  DEFAULT_HOVER_TILT_RECIPE,
  HOVER_TILT_BLEND_MODES,
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

type WorkshopSample = 'dex' | 'league';

function workshopDexMaskContext(): HoverTiltMaskContext {
  return hoverTiltMaskContextFromDex(
    getPokemonByIds(Object.values(WORKSHOP_DEX_SECTIONS).flat()),
    WORKSHOP_DEX_SECTIONS,
  );
}

function readStoredFoil(): FoilRecipe {
  const params = new URLSearchParams(window.location.search);
  if (params.has('r')) return parseFoilRecipeFromSearch(window.location.search);
  try {
    const stored = localStorage.getItem(FOIL_WORKSHOP_STORAGE_KEY);
    if (stored) return parseFoilRecipe(JSON.parse(stored) as unknown);
  } catch {
    /* quota or private mode */
  }
  return cloneFoilRecipe(DEFAULT_FOIL_RECIPE);
}

function readStoredTilt(): HoverTiltRecipe {
  const params = new URLSearchParams(window.location.search);
  if (params.has('t')) return parseHoverTiltRecipeFromSearch(window.location.search);
  try {
    const stored = localStorage.getItem(HOVER_TILT_WORKSHOP_STORAGE_KEY);
    if (stored) return parseHoverTiltRecipe(JSON.parse(stored) as unknown);
  } catch {
    /* quota or private mode */
  }
  return cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE);
}

function readStoredSample(): WorkshopSample {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('sample');
  if (fromUrl === 'league' || fromUrl === 'dex') return fromUrl;
  return 'dex';
}

function readStoredHoloBlend(): FoilHoloBlend {
  const fromUrl = new URLSearchParams(window.location.search).get('blend');
  if (isFoilHoloBlend(fromUrl)) return fromUrl;
  return FOIL_HOLO_BLEND;
}

function persistWorkshop(
  recipe: FoilRecipe,
  tilt: HoverTiltRecipe,
  sample: WorkshopSample,
  holoBlend: FoilHoloBlend,
): void {
  const qs = `${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}&blend=${holoBlend}`;
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
  const [holoBlend, setHoloBlend] = useState<FoilHoloBlend>(readStoredHoloBlend);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'link' | null>(null);
  const maskContext = useMemo(
    () => (sample === 'dex' ? workshopDexMaskContext() : EMPTY_MASK_CONTEXT),
    [sample],
  );

  const busy = src === null;
  const holo = recipe.layers.holographic;

  useEffect(() => {
    persistWorkshop(recipe, tilt, sample, holoBlend);
  }, [holoBlend, recipe, sample, tilt]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const render =
      sample === 'dex'
        ? generateExportImage(getPokemonByIds(Object.values(WORKSHOP_DEX_SECTIONS).flat()), {
            sections: WORKSHOP_DEX_SECTIONS,
          })
        : exportLeagueHome(KANTO_LEAGUE_NAME, kantoCards(), 'challenge', DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT);
    void render
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
              Holo, glare, drop shadow, and blend. Live export defaults stay on the card.
            </p>
          </div>
          <a href="/custom-gym-leader" className="pointer-events-auto shrink-0 text-zinc-100 underline">
            League builder
          </a>
        </div>
        <div className="absolute inset-0 z-[1] px-3 pb-4 pt-12 md:px-10 md:pb-10 md:pt-16">
          <ExportPreview3D
            src={src}
            alt={sample === 'dex' ? 'Dex export foil workshop' : 'League export foil workshop'}
            busy={busy}
            recipe={recipe}
            tilt={tilt}
            maskContext={maskContext}
            holoBlend={holoBlend}
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
                void copyText(JSON.stringify({ foil: recipe, tilt, holoBlend }, null, 2)).then((ok) => {
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
                const href = `${window.location.origin}${window.location.pathname}?${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}&blend=${holoBlend}`;
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
                setHoloBlend(FOIL_HOLO_BLEND);
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
              {(['dex', 'league'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  data-workshop-sample-btn={id}
                  onClick={() => setSample(id)}
                  className={`rounded-md px-1 py-2 text-center text-[0.7rem] leading-tight ${
                    sample === id ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
                  }`}
                >
                  {id === 'dex' ? 'Dex export' : 'League export'}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2" data-foil-control="holographic">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Holo / rainbow
            </legend>
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={holo.on}
                data-foil-on="holographic"
                onChange={(e) => setRecipe(withFoilLayer(recipe, 'holographic', { on: e.target.checked }))}
              />
              Rainbow on ink
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

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Blend mode
            </legend>
            <Select
              label="Rainbow"
              testId="holoBlend"
              value={holoBlend}
              options={FOIL_HOLO_BLEND_CANDIDATES}
              onChange={setHoloBlend}
            />
            <Select
              label="Glare"
              testId="blendMode"
              value={tilt.blendMode}
              options={HOVER_TILT_BLEND_MODES}
              onChange={(blendMode) => setTilt({ ...tilt, blendMode })}
            />
          </fieldset>
        </div>
      </aside>
    </div>
  );
}

function Select<T extends string>({
  label,
  testId,
  value,
  options,
  onChange,
}: {
  label: string;
  testId: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="mt-1 block text-[0.7rem] text-zinc-400">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">{value}</span>
      </span>
      <select
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-1 py-1 text-zinc-100"
        value={value}
        data-hover-tilt-select={testId}
        onChange={(e) => {
          const next = options.find((opt) => opt === e.target.value);
          if (next) onChange(next);
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
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
