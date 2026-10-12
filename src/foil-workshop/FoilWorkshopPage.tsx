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
  type FoilLayerId,
  type FoilRecipe,
} from '@/league/export/foilRecipe';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { generateExportImage } from '@/lib/exportImage';
import { computeAnalytics } from '@/hooks/useAnalytics';
import { detailedStatsData } from '@/components/view/useDetailedStatsData';
import { DEFAULT_STATS_HEIGHTS } from '@/components/view/DetailedStatsPanel';
import { renderFoilFlatCard, renderFoilTestCard } from './testCard';
import { buildFavoritesSnapshot } from '@/favorites/export/snapshot';
import { renderFullChart } from '@/favorites/export/renderFullChart';
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
import { PREVIEW_PERSPECTIVE_RATIO, type PreviewCamera } from '@/components/export/exportPreviewFit';

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
  { id: 'favorites', label: 'Favorites chart' },
  { id: 'test', label: 'Test card' },
  { id: 'flat', label: 'Flat gray card' },
  { id: 'flat-tall', label: 'Flat gray, tall' },
] as const;

/** A few picks across types and generations, like a chart in progress. */
const WORKSHOP_FAVORITE_FILLS: Record<string, number> = {
  'fire|1': 4,
  'grass|1': 1,
  'water|1': 7,
  'electric|1': 25,
  'psychic|1': 150,
  'dragon|1': 149,
  'ghost|1': 94,
  'fire|2': 157,
  'water|3': 260,
  'grass|4': 389,
};

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
  if (sample === 'favorites') return renderFullChart(buildFavoritesSnapshot(WORKSHOP_FAVORITE_FILLS));
  if (sample === 'test') return renderFoilTestCard();
  if (sample === 'flat') return renderFoilFlatCard();
  if (sample === 'flat-tall') return renderFoilFlatCard('tall');
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
const WORKSHOP_LAYERS = ['holographic', 'holoRainbow', 'prism', 'gleam', 'pointLight', 'iridescence'] as const;

/**
 * The live holo pair and its redrawn replacement (October 12). The switch
 * turns one pair on and the other off, and keeps every amount.
 */
type HoloPair = 'current' | 'new';

const HOLO_PAIRS: Record<HoloPair, readonly FoilLayerId[]> = {
  current: ['holoRainbow', 'holographic'],
  new: ['prism', 'gleam'],
};

function withHoloPair(recipe: FoilRecipe, pair: HoloPair): FoilRecipe {
  const next = cloneFoilRecipe(recipe);
  for (const name of ['current', 'new'] as const) {
    for (const id of HOLO_PAIRS[name]) next.layers[id] = { ...next.layers[id], on: name === pair };
  }
  return next;
}

/** The pair that alone is on, or null when both or neither are. */
function holoPairOf(recipe: FoilRecipe): HoloPair | null {
  const anyOn = (ids: readonly FoilLayerId[]) => ids.some((id) => recipe.layers[id].on);
  const current = anyOn(HOLO_PAIRS.current);
  const fresh = anyOn(HOLO_PAIRS.new);
  if (current === fresh) return null;
  return current ? 'current' : 'new';
}

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

/**
 * Dials for the export proposals, read against the live site's look: the
 * camera distance, the rainbow and iridescence blend, the glare's dark edge
 * (October 9), and the card size (October 11). They live
 * in the URL only, so a shared link shows the same.
 */
type RainbowBlend = 'soft-light' | 'hue';

type Proposal = {
  /** Camera distance as a multiple of the card's long edge, or a fixed 600 px. */
  camera: number | 'live';
  blend: RainbowBlend;
  /** 0 keeps the glare light only; 1 is hover-tilt's dark far stop. */
  glareDark: number;
  /** A multiple of the pre-October-10 size, or `room`: as big as the tilt allows. */
  size: number | 'room';
};

const LIVE_CAMERA_PX = 600;

const NEW_PROPOSAL: Proposal = {
  camera: PREVIEW_PERSPECTIVE_RATIO,
  blend: 'soft-light',
  glareDark: 0,
  size: 1,
};
/** The live site from October 10 to October 11. */
const LIVE_PROPOSAL: Proposal = { ...NEW_PROPOSAL, size: 'room' };
const NEW_GLARE = DEFAULT_HOVER_TILT_RECIPE.glareIntensity;
const LIVE_GLARE = 1;

function readProposal(): Proposal {
  const params = new URLSearchParams(window.location.search);
  const cam = params.get('cam');
  const ratio = Number(cam);
  const dark = Number(params.get('dark'));
  const size = params.get('size');
  return {
    camera: cam === 'live' ? 'live' : cam && Number.isFinite(ratio) ? Math.min(4, Math.max(0.5, ratio)) : NEW_PROPOSAL.camera,
    blend: params.get('blend') === 'hue' ? 'hue' : 'soft-light',
    glareDark: params.has('dark') && Number.isFinite(dark) ? Math.min(1, Math.max(0, dark)) : NEW_PROPOSAL.glareDark,
    size: size === 'room' ? 'room' : size && Number.isFinite(Number(size)) ? Math.min(1.3, Math.max(0.6, Number(size))) : NEW_PROPOSAL.size,
  };
}

function proposalSearch(p: Proposal): string {
  const cam = p.camera === 'live' ? 'live' : p.camera.toFixed(2);
  const size = p.size === 'room' ? 'room' : p.size.toFixed(2);
  return `cam=${cam}&blend=${p.blend}&dark=${p.glareDark.toFixed(2)}&size=${size}`;
}

function proposalCamera(camera: Proposal['camera']): PreviewCamera {
  if (camera === 'live') return () => LIVE_CAMERA_PX;
  return (width, height) => camera * Math.max(1, width, height);
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
  proposal: Proposal,
): void {
  const qs = `${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}&${proposalSearch(proposal)}`;
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
  const [proposal, setProposal] = useState<Proposal>(readProposal);
  const camera = useMemo(() => proposalCamera(proposal.camera), [proposal.camera]);
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'link' | null>(null);
  const maskContext = useMemo(() => sampleMaskContext(sample), [sample]);

  const busy = src === null;
  const holo = recipe.layers.holographic;
  const rainbow = recipe.layers.holoRainbow;
  const holoPair = holoPairOf(recipe);

  useEffect(() => {
    persistWorkshop(recipe, tilt, sample, proposal);
  }, [proposal, recipe, sample, tilt]);

  /** Switch to a look in one tap: the proposal dials and the glare strength. */
  const applyLook = (next: Proposal, glareIntensity: number) => {
    setProposal(next);
    setTilt({ ...tilt, glareIntensity });
  };
  const sameLook = (a: Proposal, glare: number) =>
    JSON.stringify(a) === JSON.stringify(proposal) && Math.abs(tilt.glareIntensity - glare) < 0.005;
  const look = sameLook(LIVE_PROPOSAL, LIVE_GLARE) ? 'live' : sameLook(NEW_PROPOSAL, NEW_GLARE) ? 'new' : null;

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
        <div
          className="absolute inset-0 z-[1] px-3 pb-4 pt-12 md:px-10 md:pb-10 md:pt-16"
          style={
            {
              '--foil-rainbow-blend': proposal.blend,
              '--foil-glare-dark': proposal.glareDark.toFixed(2),
            } as React.CSSProperties
          }
          data-workshop-blend={proposal.blend}
          data-workshop-glare-dark={proposal.glareDark.toFixed(2)}
        >
          <ExportPreview3D
            src={src}
            alt={`${WORKSHOP_SAMPLES.find((s) => s.id === sample)?.label ?? 'Export'} foil workshop`}
            busy={busy}
            recipe={recipe}
            tilt={tilt}
            maskContext={maskContext}
            camera={camera}
            size={proposal.size}
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
                void copyText(JSON.stringify({ foil: recipe, tilt, proposal }, null, 2)).then((ok) => {
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
                const href = `${window.location.origin}${window.location.pathname}?${foilRecipeSearch(recipe)}&${hoverTiltSearch(tilt)}&sample=${sample}&${proposalSearch(proposal)}`;
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
                setProposal(NEW_PROPOSAL);
              }}
            >
              Reset default
            </button>
          </div>

          <fieldset data-workshop-holo-switch>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Holo
            </legend>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { id: 'current', label: 'Holo: current' },
                  { id: 'new', label: 'Holo: new' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  data-workshop-holo={id}
                  aria-pressed={holoPair === id}
                  onClick={() => setRecipe(withHoloPair(recipe, id))}
                  className={`rounded-md px-1 py-2 text-center text-[0.7rem] leading-tight ${
                    holoPair === id ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.65rem] leading-snug text-zinc-500">
              Current: the live rainbow and V shine. New: the redrawn prism bands and gleam. Amounts stay as set.
            </p>
          </fieldset>

          <fieldset data-workshop-compare>
            <legend className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-500">
              Compare
            </legend>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  { id: 'live', label: 'Before October 11', next: LIVE_PROPOSAL, glare: LIVE_GLARE },
                  { id: 'new', label: 'Live site', next: NEW_PROPOSAL, glare: NEW_GLARE },
                ] as const
              ).map(({ id, label, next, glare }) => (
                <button
                  key={id}
                  type="button"
                  data-workshop-look={id}
                  aria-pressed={look === id}
                  onClick={() => applyLook(next, glare)}
                  className={`rounded-md px-1 py-2 text-center text-[0.7rem] leading-tight ${
                    look === id ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.65rem] leading-snug text-zinc-500">
              Live site since October 11: the card is its size from before October 10, and the glare is 0.6. Both
              show the shadow that follows the card&apos;s shape.
            </p>
            <label className="mt-2 flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={proposal.size === 'room'}
                data-workshop-size-room
                onChange={(e) => setProposal({ ...proposal, size: e.target.checked ? 'room' : 1 })}
              />
              Live site size (as big as the tilt allows)
            </label>
            {proposal.size !== 'room' && (
              <Slider
                label="Size (times the size before October 10)"
                min={0.6}
                max={1.3}
                step={0.05}
                value={proposal.size}
                suffix="×"
                testId="cardSize"
                onChange={(size) => setProposal({ ...proposal, size })}
              />
            )}
          </fieldset>

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
            <div className="text-[0.7rem] text-zinc-400">
              <span>Blend, rainbow and iridescence</span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(
                  [
                    { id: 'soft-light', label: 'Soft light (new)' },
                    { id: 'hue', label: 'Hue (before October 10)' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    data-workshop-rainbow-blend={id}
                    aria-pressed={proposal.blend === id}
                    onClick={() => setProposal({ ...proposal, blend: id })}
                    className={`rounded-md px-1 py-1.5 text-center leading-tight ${
                      proposal.blend === id ? 'bg-zinc-100 font-medium text-zinc-950' : 'bg-zinc-800 text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <LayerDial
            id="gleam"
            title="Gleam (new holo)"
            toggle="Broad grainy diagonal stripes"
            recipe={recipe}
            onRecipe={setRecipe}
          />
          <LayerDial
            id="prism"
            title="Prism bands (new holo)"
            toggle="Pastel rainbow bands slide with the tilt"
            recipe={recipe}
            onRecipe={setRecipe}
          />
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
            <label className="flex items-center gap-2 text-[0.7rem] text-zinc-300">
              <input
                type="checkbox"
                checked={proposal.camera === 'live'}
                data-workshop-camera-live
                onChange={(e) =>
                  setProposal({ ...proposal, camera: e.target.checked ? 'live' : NEW_PROPOSAL.camera })
                }
              />
              Fixed {LIVE_CAMERA_PX} px camera (before October 10)
            </label>
            {proposal.camera !== 'live' && (
              <Slider
                label="Camera distance (times the long edge)"
                min={0.5}
                max={4}
                step={0.05}
                value={proposal.camera}
                suffix="×"
                testId="cameraRatio"
                onChange={(ratio) => setProposal({ ...proposal, camera: ratio })}
              />
            )}
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
            <Slider
              label="Dark edge (1 before October 10)"
              min={0}
              max={1}
              step={0.05}
              value={proposal.glareDark}
              testId="glareDark"
              onChange={(glareDark) => setProposal({ ...proposal, glareDark })}
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
  id: 'prism' | 'gleam' | 'pointLight' | 'iridescence';
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
