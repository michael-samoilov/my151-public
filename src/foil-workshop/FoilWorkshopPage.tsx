import { useEffect, useMemo, useState } from 'react';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { EXPORT_OVERLAY_SCRIM_CLASS, EXPORT_OVERLAY_SCRIM_STYLE } from '@/components/export/exportOverlayScrim';
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
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { generateExportImage } from '@/lib/exportImage';
import {
  DEFAULT_HOVER_TILT_RECIPE,
  HOVER_TILT_BLEND_MODES,
  HOVER_TILT_MASK_COMPOSITES,
  HOVER_TILT_MASK_IDS,
  HOVER_TILT_MASK_META,
  HOVER_TILT_MASK_MODES,
  HOVER_TILT_WORKSHOP_STORAGE_KEY,
  cloneHoverTiltRecipe,
  hoverTiltCssVars,
  hoverTiltSearch,
  parseHoverTiltRecipe,
  parseHoverTiltRecipeFromSearch,
  type HoverTiltMaskId,
  type HoverTiltRecipe,
} from '@/components/export/hoverTiltRecipe';
import {
  DEFAULT_MASK_CONTEXT,
  type HoverTiltMaskContext,
} from '@/components/export/hoverTiltMasks';

const SIMEY = 'https://hover-tilt.simey.me';

const WORKSHOP_DEX_SECTIONS: Record<string, number[]> = {
  starter: DEMO_DEX_SECTIONS.starter,
  'early-bug': DEMO_DEX_SECTIONS['early-bug'],
  'pikachu-clone': DEMO_DEX_SECTIONS['pikachu-clone'],
  legendary: DEMO_DEX_SECTIONS.legendary,
  mythical: DEMO_DEX_SECTIONS.mythical,
};

type WorkshopSample = 'dex' | 'league';

function featuredMaskContext(): HoverTiltMaskContext {
  const firstId = WORKSHOP_DEX_SECTIONS.starter[0];
  const mon = getPokemonByIds([firstId])[0];
  if (!mon) return DEFAULT_MASK_CONTEXT;
  return { type: mon.types[0] ?? 'grass', dexNumber: mon.id };
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

function readStoredDarkCard(): boolean {
  return new URLSearchParams(window.location.search).get('dark') === '1';
}

function persistWorkshop(
  recipe: FoilRecipe,
  tilt: HoverTiltRecipe,
  sample: WorkshopSample,
  darkCard: boolean,
): void {
  const qs = `${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}${darkCard ? '&dark=1' : ''}`;
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

/**
 * Preview-only studio: a real export on the tilting card, native hover-tilt
 * knobs, selectable glare/sparkle masks, and foil-layer sliders.
 */
export function FoilWorkshopPage() {
  const [recipe, setRecipe] = useState<FoilRecipe>(readStoredFoil);
  const [tilt, setTilt] = useState<HoverTiltRecipe>(readStoredTilt);
  const [solo, setSolo] = useState<FoilLayerId | null>(null);
  const [sample, setSample] = useState<WorkshopSample>(readStoredSample);
  const [darkCard, setDarkCard] = useState(readStoredDarkCard);
  const [layout, setLayout] = useState<LeagueHomeExportLayout>(DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'link' | null>(null);
  const maskContext = useMemo(() => featuredMaskContext(), []);

  const previewRecipe = useMemo(() => recipeWithSolo(recipe, solo), [recipe, solo]);
  const busy = src === null;
  const tiltVars = hoverTiltCssVars(tilt);

  useEffect(() => {
    persistWorkshop(recipe, tilt, sample, darkCard);
  }, [darkCard, recipe, sample, tilt]);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    const render =
      sample === 'dex'
        ? generateExportImage(getPokemonByIds(Object.values(WORKSHOP_DEX_SECTIONS).flat()), {
            sections: WORKSHOP_DEX_SECTIONS,
          })
        : exportLeagueHome(
            KANTO_LEAGUE_NAME,
            kantoCards(),
            layout.teamMode === 'rematch' ? 'rematch' : 'challenge',
            layout,
          );
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
  }, [layout, sample]);

  const flash = (kind: 'json' | 'link') => {
    setCopied(kind);
    window.setTimeout(() => setCopied((now) => (now === kind ? null : now)), 1600);
  };

  const applyMask = (id: HoverTiltMaskId) => {
    setTilt({ ...tilt, glareMask: id, sparkleMask: id });
  };

  return (
    <div
      className="flex min-h-svh flex-col bg-zinc-950 text-zinc-100 md:h-svh md:grid md:grid-cols-[minmax(0,1fr)_24rem] md:grid-rows-1"
      data-foil-workshop
      data-workshop-sample={sample}
      data-workshop-dark-card={darkCard ? '1' : '0'}
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
              Native hover-tilt knobs from{' '}
              <a className="pointer-events-auto text-zinc-50 underline" href={SIMEY}>
                hover-tilt.simey.me
              </a>
              . Switch a mask to clip glare, holo, and sparkle.
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
            recipe={previewRecipe}
            tilt={tilt}
            maskContext={maskContext}
            darkCard={darkCard}
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
                const href = `${window.location.origin}${window.location.pathname}?${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}${darkCard ? '&dark=1' : ''}`;
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
                setTilt(cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE));
                setSample('dex');
                setDarkCard(false);
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
            <label className="mt-2 flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={darkCard}
                data-workshop-dark-card-toggle
                onChange={(e) => setDarkCard(e.target.checked)}
              />
              Dark card (white glare on a dark poster)
            </label>
          </fieldset>

          <fieldset className="space-y-2" data-hover-tilt-masks>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Glare / sparkle masks
            </legend>
            <p className="text-[0.7rem] leading-snug text-zinc-400">
              Each mask clips native glare, holo, and sparkle. Credit-cards{' '}
              <a className="text-zinc-200 underline" href={`${SIMEY}/bespoke/credit-cards/`}>
                holo glare demo
              </a>
              {' · '}
              <a className="text-zinc-200 underline" href={`${SIMEY}/bespoke/pokemon-cards/`}>
                pokemon-cards demo
              </a>
              {' · '}
              <a className="text-zinc-200 underline" href={`${SIMEY}/advanced/glare-masks/`}>
                glare-mask docs
              </a>
              .
            </p>
            <ul className="space-y-1">
              {HOVER_TILT_MASK_IDS.map((id) => {
                const meta = HOVER_TILT_MASK_META[id];
                const selected = tilt.glareMask === id;
                return (
                  <li key={id}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 ${
                        selected
                          ? 'border-amber-400/80 bg-zinc-950'
                          : 'border-zinc-800 bg-zinc-950/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="hover-tilt-mask"
                        className="mt-1"
                        checked={selected}
                        data-hover-tilt-mask={id}
                        onChange={() => applyMask(id)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-50">{meta.title}</span>
                        <span className="block text-[0.7rem] leading-snug text-zinc-400">{meta.blurb}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-[0.7rem] text-zinc-500" data-hover-tilt-mask-active>
              Active glare {tilt.glareMask} · sparkle {tilt.sparkleMask} · featured #{maskContext.dexNumber}{' '}
              {maskContext.type}
            </p>
          </fieldset>

          <fieldset className="space-y-2" data-hover-tilt-knobs>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Hover-tilt
            </legend>
            <p className="text-[0.7rem] leading-snug text-zinc-400">
              Documented props from{' '}
              <a className="text-zinc-200 underline" href={`${SIMEY}/options/props/`}>
                props
              </a>
              {' and '}
              <a className="text-zinc-200 underline" href={`${SIMEY}/options/css/`}>
                CSS custom properties
              </a>
              .
            </p>
            <Slider
              label="tiltFactor"
              min={0}
              max={25}
              step={0.1}
              value={tilt.tiltFactor}
              suffix="°"
              testId="tiltFactor"
              onChange={(tiltFactor) => setTilt({ ...tilt, tiltFactor })}
            />
            <Slider
              label="tiltFactorY"
              min={0}
              max={25}
              step={0.1}
              value={tilt.tiltFactorY}
              suffix="°"
              testId="tiltFactorY"
              onChange={(tiltFactorY) => setTilt({ ...tilt, tiltFactorY })}
            />
            <Slider
              label="scaleFactor"
              min={1}
              max={1.12}
              step={0.005}
              value={tilt.scaleFactor}
              testId="scaleFactor"
              onChange={(scaleFactor) => setTilt({ ...tilt, scaleFactor })}
            />
            <Slider
              label="enterDelay"
              min={0}
              max={600}
              step={20}
              value={tilt.enterDelay}
              suffix=" ms"
              testId="enterDelay"
              onChange={(enterDelay) => setTilt({ ...tilt, enterDelay })}
            />
            <Slider
              label="exitDelay"
              min={0}
              max={1200}
              step={20}
              value={tilt.exitDelay}
              suffix=" ms"
              testId="exitDelay"
              onChange={(exitDelay) => setTilt({ ...tilt, exitDelay })}
            />
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={tilt.shadow}
                data-hover-tilt-shadow
                onChange={(e) => setTilt({ ...tilt, shadow: e.target.checked })}
              />
              Drop shadow
            </label>
            <Slider
              label="shadowBlur"
              min={0}
              max={80}
              step={1}
              value={tilt.shadowBlur}
              suffix=" px"
              testId="shadowBlur"
              onChange={(shadowBlur) => setTilt({ ...tilt, shadowBlur })}
            />
            <Slider
              label="glareIntensity"
              min={0}
              max={1}
              step={0.01}
              value={tilt.glareIntensity}
              testId="glareIntensity"
              onChange={(glareIntensity) => setTilt({ ...tilt, glareIntensity })}
            />
            <Slider
              label="glareHue"
              min={0}
              max={360}
              step={1}
              value={tilt.glareHue}
              suffix="°"
              testId="glareHue"
              onChange={(glareHue) => setTilt({ ...tilt, glareHue })}
            />
            <Slider
              label="sparkleIntensity"
              min={0}
              max={1}
              step={0.01}
              value={tilt.sparkleIntensity}
              testId="sparkleIntensity"
              onChange={(sparkleIntensity) => setTilt({ ...tilt, sparkleIntensity })}
            />
            <Select
              label="blendMode"
              testId="blendMode"
              value={tilt.blendMode}
              options={HOVER_TILT_BLEND_MODES}
              onChange={(blendMode) => setTilt({ ...tilt, blendMode })}
            />
            <Select
              label="glareMaskMode"
              testId="glareMaskMode"
              value={tilt.glareMaskMode}
              options={HOVER_TILT_MASK_MODES}
              onChange={(glareMaskMode) => setTilt({ ...tilt, glareMaskMode })}
            />
            <Select
              label="glareMaskComposite"
              testId="glareMaskComposite"
              value={tilt.glareMaskComposite}
              options={HOVER_TILT_MASK_COMPOSITES}
              onChange={(glareMaskComposite) => setTilt({ ...tilt, glareMaskComposite })}
            />
            <dl
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-[0.65rem] text-zinc-300"
              data-hover-tilt-readout
            >
              {Object.entries(tiltVars).map(([key, value]) => (
                <ReadoutRow key={key} name={key} value={value} />
              ))}
              <ReadoutRow name="--hover-tilt-glare-mask" value={tilt.glareMask} />
              <ReadoutRow name="--hover-tilt-sparkle-mask" value={tilt.sparkleMask} />
            </dl>
          </fieldset>

          {sample === 'league' ? (
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
          ) : null}

          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Tilt
            </legend>
            <Slider
              label="Idle tilt"
              min={0}
              max={30}
              step={0.5}
              value={recipe.idleTilt}
              suffix="°"
              testId="idleTilt"
              onChange={(idleTilt) => setRecipe({ ...recipe, idleTilt })}
            />
            <Slider
              label="Idle X period"
              min={2000}
              max={24000}
              step={500}
              value={recipe.idleMsX}
              suffix=" ms"
              testId="idleMsX"
              onChange={(idleMsX) => setRecipe({ ...recipe, idleMsX })}
            />
            <Slider
              label="Idle Y period"
              min={2000}
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

function ReadoutRow({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-500">{name}</dt>
      <dd className="truncate text-zinc-200" title={value}>
        {value}
      </dd>
    </>
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
