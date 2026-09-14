import { useEffect, useMemo, useState } from 'react';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { KANTO_LEAGUE_NAME, kantoCards } from '@/league/data/kantoLeague';
import { exportLeagueHome } from '@/league/export/exportLeague';
import {
  DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT,
  type LeagueHomeExportLayout,
  type LeagueHomeTeamMode,
} from '@/league/export/exportOptions';
import {
  DEFAULT_FOIL_RECIPE,
  FOIL_LAYER_IDS,
  FOIL_LAYER_META,
  FOIL_WORKSHOP_STORAGE_KEY,
  cloneFoilRecipe,
  foilRecipeSearch,
  parseFoilRecipe,
  parseFoilRecipeFromSearch,
  recipeWithSolo,
  withFoilLayer,
  type FoilLayerId,
  type FoilRecipe,
} from '@/league/export/foilRecipe';

function readStoredRecipe(): FoilRecipe {
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

function persistRecipe(recipe: FoilRecipe): void {
  const qs = foilRecipeSearch(recipe);
  window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
  try {
    localStorage.setItem(FOIL_WORKSHOP_STORAGE_KEY, JSON.stringify(recipe));
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

/**
 * Preview-only studio: a real league export on the tilting card, and sliders
 * for every lighting layer. Copy the recipe when a mix looks right.
 */
export function FoilWorkshopPage() {
  const [recipe, setRecipe] = useState<FoilRecipe>(readStoredRecipe);
  const [solo, setSolo] = useState<FoilLayerId | null>(null);
  const [layout, setLayout] = useState<LeagueHomeExportLayout>(DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'link' | null>(null);

  const previewRecipe = useMemo(() => recipeWithSolo(recipe, solo), [recipe, solo]);
  const busy = src === null;

  useEffect(() => {
    persistRecipe(recipe);
  }, [recipe]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const view = layout.teamMode === 'rematch' ? 'rematch' : 'challenge';
    void exportLeagueHome(KANTO_LEAGUE_NAME, kantoCards(), view, layout)
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
  }, [layout]);

  const flash = (kind: 'json' | 'link') => {
    setCopied(kind);
    window.setTimeout(() => setCopied((now) => (now === kind ? null : now)), 1600);
  };

  return (
    <div
      className="flex min-h-svh flex-col bg-zinc-950 text-zinc-100 md:h-svh md:grid md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-1"
      data-foil-workshop
    >
      <section className="relative flex min-h-[42svh] flex-1 flex-col md:min-h-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 text-[0.7rem] leading-snug text-zinc-400">
          <div>
            <h1 className="text-sm font-semibold text-zinc-50">Export foil workshop</h1>
            <p className="mt-0.5 max-w-[40rem]">
              Preview only. Drag the card. Tap it to park. Toggle layers, then copy the recipe.
            </p>
          </div>
          <a href="/custom-gym-leader" className="pointer-events-auto shrink-0 text-zinc-300 underline">
            League builder
          </a>
        </div>
        <div className="min-h-0 flex-1 px-3 pb-3 pt-14">
          <ExportPreview3D src={src} alt="League export foil workshop" busy={busy} recipe={previewRecipe} />
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
                void copyText(JSON.stringify(recipe, null, 2)).then((ok) => {
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
                const href = `${window.location.origin}${window.location.pathname}?${foilRecipeSearch(recipe)}`;
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
                setSolo(null);
                setRecipe(cloneFoilRecipe(DEFAULT_FOIL_RECIPE));
              }}
            >
              Reset default
            </button>
          </div>

          <fieldset>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Teams
            </legend>
            <div className="grid grid-cols-3 gap-1">
              {(['story', 'rematch', 'both'] as const).map((mode) => (
                <TeamButton
                  key={mode}
                  mode={mode}
                  selected={layout.teamMode === mode}
                  onClick={() => setLayout({ ...layout, teamMode: mode })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Tilt
            </legend>
            <Slider
              label="Idle tilt"
              min={0}
              max={20}
              step={0.5}
              value={recipe.idleTilt}
              suffix="°"
              testId="idleTilt"
              onChange={(idleTilt) => setRecipe({ ...recipe, idleTilt })}
            />
            <Slider
              label="Idle X period"
              min={4000}
              max={24000}
              step={500}
              value={recipe.idleMsX}
              suffix=" ms"
              testId="idleMsX"
              onChange={(idleMsX) => setRecipe({ ...recipe, idleMsX })}
            />
            <Slider
              label="Idle Y period"
              min={4000}
              max={24000}
              step={500}
              value={recipe.idleMsY}
              suffix=" ms"
              testId="idleMsY"
              onChange={(idleMsY) => setRecipe({ ...recipe, idleMsY })}
            />
            <Slider
              label="Shine dead zone"
              min={0}
              max={12}
              step={0.5}
              value={recipe.deadDeg}
              suffix="°"
              testId="deadDeg"
              onChange={(deadDeg) => setRecipe({ ...recipe, deadDeg })}
            />
            <Slider
              label="Max pointer tilt"
              min={8}
              max={35}
              step={1}
              value={recipe.maxTilt}
              suffix="°"
              testId="maxTilt"
              onChange={(maxTilt) => setRecipe({ ...recipe, maxTilt })}
            />
            <Slider
              label="Parallax px"
              min={0}
              max={24}
              step={1}
              value={recipe.parallaxPx}
              suffix=" px"
              testId="parallaxPx"
              onChange={(parallaxPx) => setRecipe({ ...recipe, parallaxPx })}
            />
            <Slider
              label="Bloom blur"
              min={0}
              max={40}
              step={1}
              value={recipe.bloomBlurPx}
              suffix=" px"
              testId="bloomBlurPx"
              onChange={(bloomBlurPx) => setRecipe({ ...recipe, bloomBlurPx })}
            />
            <Slider
              label="Hotspot size"
              min={0.08}
              max={0.8}
              step={0.02}
              value={recipe.specSize}
              testId="specSize"
              onChange={(specSize) => setRecipe({ ...recipe, specSize })}
            />
          </fieldset>

          <div className="space-y-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">Layers</p>
            {FOIL_LAYER_IDS.map((id) => {
              const layer = recipe.layers[id];
              const meta = FOIL_LAYER_META[id];
              const soloOn = solo === id;
              return (
                <div
                  key={id}
                  className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2"
                  data-foil-control={id}
                >
                  <div className="flex items-start gap-2">
                    <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={layer.on}
                        data-foil-on={id}
                        onChange={(e) => setRecipe(withFoilLayer(recipe, id, { on: e.target.checked }))}
                      />
                      <span>
                        <span className="font-medium text-zinc-50">{meta.title}</span>
                        <span className="mt-0.5 block text-[0.7rem] leading-snug text-zinc-400">{meta.blurb}</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] ${
                        soloOn ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
                      }`}
                      data-foil-solo={id}
                      onClick={() => setSolo((now) => (now === id ? null : id))}
                    >
                      Solo
                    </button>
                  </div>
                  <Slider
                    label="Amount"
                    min={0}
                    max={1}
                    step={0.01}
                    value={layer.amount}
                    testId={id}
                    onChange={(amount) => setRecipe(withFoilLayer(recipe, id, { amount }))}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TeamButton({
  mode,
  selected,
  onClick,
}: {
  mode: LeagueHomeTeamMode;
  selected: boolean;
  onClick: () => void;
}) {
  const label = mode === 'both' ? 'Story and rematch' : mode === 'story' ? 'Story' : 'Rematch';
  return (
    <button
      type="button"
      onClick={onClick}
      data-export-team={mode}
      className={`rounded-md px-1 py-2 text-center text-[0.7rem] leading-tight ${
        selected ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
      }`}
    >
      {label}
    </button>
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
