// Standard-surface invariants every change re-checks, driven through the Session
// interface so one flow runs on all three engines. Handles are structural
// (data-nav, computed style, the localStorage oracle), never localized text.
import type { Session } from './engines.ts';
import { READ_PERSONA, assertPersona, type PersonaReadback, type PersonaName } from './personas.ts';
import type { Check } from './evidence.ts';
import { auditBody, findingKey, APP_HARD_KINDS } from '../../../render-audit/audit-core.mjs';

// Source of truth: src/lib/demoMode.ts POKEDEX_STORAGE_KEY (local build) and
// src/store/usePokedexStore.ts persist version.
// The dex builder's own page since the launch of the hub at "/".
const DEX_PATH = '/pokedex-builder';
const STORE_KEY = 'personal-151-pokedex-v3';
const STORE_VERSION = 10;

// A real slice of src/data/demoDex.ts (genuine group assignments), 37 placed —
// past the 25 analytics unlock. Seeded through localStorage, which is engine- and
// build-agnostic (no dependence on preview-only ?demo / ?tune).
const SEED_SECTIONS: Record<string, number[]> = {
  starter: [387, 388, 389, 255, 256, 257, 656, 657, 658],
  'early-bug': [736, 737, 738, 543, 544, 545, 123, 212, 900],
  forest: [46, 47, 453, 454, 708, 709, 56, 57, 979, 273, 274, 275, 216, 217, 901, 252, 253, 254, 640],
};
const SEED_COUNT = Object.values(SEED_SECTIONS).reduce((n, a) => n + a.length, 0);

function seedValue(sections: Record<string, number[]>): string {
  const count = Object.values(sections).reduce((n, a) => n + a.length, 0);
  return JSON.stringify({
    state: { sections, milestoneMax: count, milestoneCelebrated: [25].filter((m) => m <= count), localeNoticeSeen: true },
    version: STORE_VERSION,
  });
}

const ok = (name: string, cond: boolean, detail?: string): Check => ({ name, status: cond ? 'pass' : 'fail', detail });

interface AuditFinding { kind: string; severity: string; path: string; text: string; detail: string; }

/**
 * The render audit (.claude/skills/render-audit), run on the page as it
 * stands: clipped boxes, cut text, broken images. Sprites are CSS-sized on
 * screen and an ellipsis is a designed truncation, so those stay warnings
 * here. The frame checks stay off: an app page scrolls, so content below the
 * fold is not outside anything. The check fails on hard findings; every finding
 * rides along as a key, so diff mode names the new ones as regressions even
 * when the base already carried some.
 */
async function auditRender(s: Session, name: string): Promise<Check> {
  try {
    const result = await s.evalJson<{ findings: AuditFinding[] }>(auditBody({ minFont: 8, annotate: false, checkFrame: false, offCanvasOk: true }));
    const hard = result.findings.filter((f) => APP_HARD_KINDS.includes(f.kind));
    const detail = hard.slice(0, 4).map((f) => `${f.kind}: ${f.detail} (${f.text || f.path})`).join(' | ');
    return {
      name,
      status: hard.length === 0 ? 'pass' : 'fail',
      detail: hard.length ? `${hard.length} hard finding(s): ${detail}` : `${result.findings.length} warning(s), no hard findings`,
      findings: result.findings.map(findingKey),
    };
  } catch (e) {
    return { name, status: 'fail', detail: `audit did not run: ${(e as Error).message.slice(0, 120)}` };
  }
}

/**
 * Wait for a page to stop drawing before it is audited.
 *
 * A tab click flips the active pill at once, but the view and analytics pages
 * fetch and lay out their content after that. Auditing there reads a page
 * that is not yet the page — the evidence for one false regression showed the
 * view page still on its spinner — and whether the grid has painted is a
 * race, so two identical trees disagreed run to run by 175 to 188 findings.
 * Poll until the element count holds still twice, then audit. On a timeout,
 * audit what is there rather than failing: a slow page is still a page.
 */
async function settle(s: Session, limit = 5000): Promise<void> {
  let last = -1;
  let steady = 0;
  const started = Date.now();
  while (Date.now() - started < limit) {
    await new Promise((r) => setTimeout(r, 150));
    const n = await s.evalJson<number>('return document.querySelectorAll("*").length;');
    if (n === last) {
      if (++steady >= 2) return;
    } else {
      steady = 0;
      last = n;
    }
  }
}

async function waitForApp(s: Session, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const mounted = await s.evalJson<boolean>(`const r=document.getElementById('root'); return !!r && r.children.length>0;`).catch(() => false);
    if (mounted) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// The store's persist layer writes its initial value shortly after mount. Seeding
// before that write races it: our value lands, then the app clobbers it with an
// empty dex before the reload. Wait for the key to appear first, so our write is
// the last one before we reload.
async function waitForStoreKey(s: Session, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const present = await s.evalJson<boolean>(`return !!localStorage.getItem(${JSON.stringify(STORE_KEY)});`).catch(() => false);
    if (present) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Count placed Pokémon in the persisted store; 0 if absent or unparseable.
async function readSeedCount(s: Session): Promise<number> {
  return s
    .evalJson<number>(`const raw=localStorage.getItem(${JSON.stringify(STORE_KEY)}); if(!raw) return 0; try { const d=JSON.parse(raw); return Object.values(d.state?.sections||{}).reduce((n,a)=>n+a.length,0); } catch { return 0; }`)
    .catch(() => 0);
}

// The store persists several times during boot (locale, milestone, intro effects).
// A single pre-reload write races those: a late boot write clobbers our seed with
// an empty dex. Write, then confirm it holds across two reads (~0.5s) so our value
// is the last one before reload; rewrite if a boot write overwrote it.
async function writeSeedUntilStable(s: Session): Promise<boolean> {
  const value = seedValue(SEED_SECTIONS);
  for (let i = 0; i < 15; i++) {
    await s.evalJson(`localStorage.setItem(${JSON.stringify(STORE_KEY)}, ${JSON.stringify(value)}); return true;`);
    await sleep(250);
    if ((await readSeedCount(s)) !== SEED_COUNT) continue;
    await sleep(300);
    if ((await readSeedCount(s)) === SEED_COUNT) return true;
  }
  return false;
}

// Seed a known dex, engine-agnostic (localStorage, no preview-only flags), then
// reload so the app rehydrates from it. Retry the whole cycle if a reload lands
// empty.
export async function seedDex(s: Session, base: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await s.navigate(base + DEX_PATH);
    await waitForApp(s);
    await waitForStoreKey(s);
    await writeSeedUntilStable(s);
    await s.navigate(base + DEX_PATH);
    await waitForApp(s);
    await waitForStoreKey(s);
    if ((await readSeedCount(s)) === SEED_COUNT) return;
  }
}

// Which view is active, read from the nav buttons' computed background. The active
// tab uses the "default" Button variant with a non-transparent fill; ghosts
// compute to transparent. The fill serializes as rgb(), rgba(), or oklab()
// depending on the engine and state, so test for "not transparent" rather than
// parse a color format. Engine-portable and free of localized text.
const ACTIVE_VIEW = `
const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
const btns = [...document.querySelectorAll('[data-nav]')];
const active = btns.filter(b => !TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim())).map(b => b.getAttribute('data-nav'));
return { active, navs: btns.map(b => b.getAttribute('data-nav')) };
`;

async function activeView(s: Session): Promise<{ active: string[]; navs: string[] }> {
  return s.evalJson(ACTIVE_VIEW);
}

// Nav buttons animate background-color, so just after a click both the old and new
// tab read non-transparent for a beat. Poll until the active set settles to exactly
// the target, or time out and return the last reading.
async function waitForActiveView(s: Session, nav: string, timeoutMs = 2500): Promise<{ active: string[]; navs: string[] }> {
  const deadline = Date.now() + timeoutMs;
  let last = await activeView(s);
  while (Date.now() < deadline) {
    if (last.active.length === 1 && last.active[0] === nav) return last;
    await sleep(150);
    last = await activeView(s);
  }
  return last;
}

// No horizontal page scroll, and the document painted a non-trivial area.
const LAYOUT = `
const de = document.documentElement;
return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, bodyH: document.body.getBoundingClientRect().height };
`;

// A blanket overlap audit over the whole body false-positives on the dense sprite
// grid, whose type badges and labels intentionally overlap their tiles, so it is
// not a standard check. For a scoped overlap/escapes-parent audit of a specific
// container in a future tool, port e2e/support/layoutAudit.ts, which is built to
// run over one subtree, not the whole app.

async function totalPlaced(s: Session): Promise<number> {
  return readSeedCount(s);
}

// A real user action that mutates the persisted store, not a seed round-trip: open
// the browser for a seed-free section and click an evo-line card, which on desktop
// instantly adds the line (PokemonBrowser.tsx handleToggleStage). The browser cards
// carry no stable handle today, so this activates once a `data-testid="verify-evo-
// card"` lands on the card (a one-line change); until then it skips, loudly. Runs
// on desktop-width Blink, where the instant-add path applies.
const PLACE_CARD = '[data-testid="verify-evo-card"]';

async function driveRealPlacement(s: Session): Promise<Check> {
  const name = 'placement:real-add-grows-store';
  const addBtn = await s.evalJson<boolean>(`return !!document.querySelector('[aria-label="Add a Pokémon to Meadow"]');`).catch(() => false);
  if (!addBtn) return { name, status: 'skip', detail: 'Meadow add button not found (locale or layout changed)' };
  const before = await totalPlaced(s);
  await s.click('[aria-label="Add a Pokémon to Meadow"]');
  await sleep(800);
  // The browser renders its cards only once opened, so check the handle now.
  const cardPresent = await s.evalJson<boolean>(`return !!document.querySelector(${JSON.stringify(PLACE_CARD)});`).catch(() => false);
  if (!cardPresent) return { name, status: 'skip', detail: `add ${PLACE_CARD} to the browser evo-line card to enable (tier-2 one-liner)` };
  await s.click(PLACE_CARD);
  await sleep(800);
  const after = await totalPlaced(s);
  return ok(name, after > before, `total ${before} -> ${after}`);
}

export interface FlowContext { base: string; surface: string; shot: (label: string) => string; }

// The full standard suite for one surface. Persona is asserted first when set.
export async function runStandardSuite(s: Session, persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];

  if (persona) {
    const got = await s.evalJson<PersonaReadback>(READ_PERSONA);
    try { assertPersona(persona, got); checks.push(ok(`persona:${persona}`, true, got.ua)); }
    catch (e) { checks.push(ok(`persona:${persona}`, false, (e as Error).message)); }
  }

  // Boot on a clean origin.
  await s.navigate(ctx.base + DEX_PATH);
  await s.evalJson(`try{localStorage.setItem('p151-league-promo-seen','1');localStorage.setItem('p151-moved-notice-seen','1');}catch{} return true;`);
  await s.navigate(ctx.base + DEX_PATH);
  const booted = await waitForApp(s);
  checks.push(ok('boot:react-mounted', booted));
  await s.screenshot(ctx.shot('boot'));

  const layout = await s.evalJson<{ scrollWidth: number; innerWidth: number; bodyH: number }>(LAYOUT);
  checks.push(ok('layout:no-horizontal-overflow', layout.scrollWidth <= layout.innerWidth + 2, `scrollWidth ${layout.scrollWidth} vs innerWidth ${layout.innerWidth}`));
  checks.push(ok('layout:painted-area', layout.bodyH > 100, `body height ${layout.bodyH}`));

  // Seed a dex so analytics unlocks and the grid is populated.
  await seedDex(s, ctx.base);
  const oracle = await s.evalJson<{ has: boolean; count: number }>(
    `const raw=localStorage.getItem(${JSON.stringify(STORE_KEY)}); if(!raw) return {has:false,count:0}; const d=JSON.parse(raw); const secs=d.state?.sections||{}; const c=Object.values(secs).reduce((n,a)=>n+a.length,0); return {has:c>0,count:c};`,
  );
  checks.push(ok('oracle:seed-persisted', oracle.has && oracle.count === SEED_COUNT, `sections count ${oracle.count}, expected ${SEED_COUNT}`));

  // Grid renders the seeded dex (sprite images present). Settle first: the
  // grid mounts after the store rehydrates, and on the software-rendered
  // WebKit lane the count was read before a single tile existed, so the same
  // two trees passed one run and failed the next with `img count 0`.
  await settle(s);
  const sprites = await s.evalJson<number>(`return document.querySelectorAll('img').length;`);
  checks.push(ok('builder:sprites-rendered', sprites >= 10, `img count ${sprites}`));
  await s.screenshot(ctx.shot('builder-seeded'));
  checks.push(await auditRender(s, 'render:no-clipped-content'));

  // Navigate each tab and confirm exactly it becomes active — and that the
  // tool bar's three cells (title/count, centred nav, page controls) hold
  // their lanes: title content must end before the nav starts, and the nav
  // must end before the right cell's first control. Structural rects only.
  for (const nav of ['view', 'analytics', 'builder'] as const) {
    await s.click(`[data-nav="${nav}"]`);
    const view = await waitForActiveView(s, nav);
    checks.push(ok(`nav:${nav}-active`, view.active.length === 1 && view.active[0] === nav, `active=[${view.active.join(',')}]`));
    const lanes = await s.evalJson<{ ok: boolean; found: boolean; detail: string }>(
      `const title=document.querySelector('[data-testid="tool-title"]');
       const actions=document.querySelector('[data-testid="tool-actions"]');
       const navs=[...document.querySelectorAll('[data-nav]')];
       if(!title||!actions||navs.length===0) return {ok:false,found:false,detail:'handles missing'};
       const navLeft=Math.min(...navs.map(b=>b.getBoundingClientRect().left));
       const navRight=Math.max(...navs.map(b=>b.getBoundingClientRect().right));
       const inner=title.firstElementChild;
       const titleRight=inner?inner.getBoundingClientRect().right:title.getBoundingClientRect().left;
       const kids=[...actions.children].map(k=>k.getBoundingClientRect().left);
       const actionsLeft=kids.length?Math.min(...kids):actions.getBoundingClientRect().right;
       const ok=titleRight<=navLeft+0.5&&navRight<=actionsLeft+0.5;
       return {ok,found:true,detail:'title.r='+Math.round(titleRight)+' nav=['+Math.round(navLeft)+','+Math.round(navRight)+'] actions.l='+Math.round(actionsLeft)};`,
    );
    checks.push(ok(`header:${nav}-no-overlap`, lanes.found && lanes.ok, lanes.detail));
    await settle(s);
    await s.screenshot(ctx.shot(`nav-${nav}`));
    checks.push(await auditRender(s, `render:${nav}-no-clipped-content`));
  }

  // Scroll the builder container: setting the offset must take (proves it scrolls).
  await s.click('[data-nav="builder"]');
  await new Promise((r) => setTimeout(r, 300));
  const scrolled = await s.evalJson<{ before: number; after: number; found: boolean }>(
    `const el=document.querySelector('[data-build-scroll]'); if(!el) return {before:0,after:0,found:false}; const before=el.scrollTop; el.scrollTop=before+300; return {before, after:el.scrollTop, found:true};`,
  );
  checks.push(ok('scroll:builder-container', scrolled.found && scrolled.after > scrolled.before, `top ${scrolled.before}->${scrolled.after}`));

  // Prove a real user action mutates the persisted store, on desktop-width Blink
  // where the instant-add path applies. Other surfaces prove rendering, not this.
  if (s.engine === 'blink' && persona === null) {
    checks.push(await driveRealPlacement(s));
  } else {
    checks.push({ name: 'placement:real-add-grows-store', status: 'skip', detail: 'desktop-width Blink only (picker staging differs by surface)' });
  }

  // Zero-tolerance regression tripwire: no uncaught error or ErrorBoundary crash
  // over the whole run. Authoritative on Blink (host-side events); best-effort on
  // WebKit and Gecko (post-load page trap), backed by the render checks above.
  const errs = await s.errors();
  checks.push(ok('runtime:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));

  return checks;
}

async function waitForDexPreviewImg(s: Session, ms = 45000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const ready = await s.evalJson<boolean>(
      `const img=document.querySelector('[data-export-preview] img');
       return !!(img instanceof HTMLImageElement && img.naturalWidth > 0);`,
    ).catch(() => false);
    if (ready) return true;
    await sleep(200);
  }
  return false;
}

async function waitForFoilMaps(s: Session, ms = 15000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const ready = await s.evalJson<boolean>(
      `return document.querySelector('[data-export-preview]')?.getAttribute('data-foil-maps')==='1';`,
    ).catch(() => false);
    if (ready) return true;
    await sleep(200);
  }
  return false;
}

/** Rainbow on ink only: sat-mask + hue blend. Paper stays white. */
async function readInkOnlyRainbow(s: Session): Promise<{ ok: boolean; reason: string }> {
  return s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     const holo=document.querySelector('[data-foil-layer="holographic"]');
     const hit=document.querySelector('[data-export-tilt-hit]');
     if(!(card instanceof HTMLElement) || !(holo instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const maps=card.getAttribute('data-foil-maps')||'';
     if(maps!=='1') return {ok:false,reason:'maps '+maps};
     const cs=getComputedStyle(holo);
     const mask=(cs.getPropertyValue('-webkit-mask-image')+' '+cs.maskImage).replace(/\\s+/g,' ').trim();
     const mix=cs.mixBlendMode;
     const opacity=Number(cs.opacity);
     const amount=Number(getComputedStyle(card).getPropertyValue('--foil-holographic'));
     const foil=Number(card.getAttribute('data-foil-opacity')||0);
     if(mix!=='hue') return {ok:false,reason:'blend '+mix};
     if(!(opacity>0.04)) return {ok:false,reason:'opacity '+opacity.toFixed(3)};
     if(Math.abs(amount-0.25)>0.02) return {ok:false,reason:'amount '+amount};
     if(!(foil>0.2)) return {ok:false,reason:'foil '+foil.toFixed(3)};
     if(!mask.includes('url(')) return {ok:false,reason:'unmasked '+mask.slice(0,40)};
     if(!cs.backgroundImage.includes('repeating-linear-gradient')) return {ok:false,reason:'no grating'};
     if(holo.offsetWidth<80 || holo.offsetHeight<80) return {ok:false,reason:'size '+holo.offsetWidth+'x'+holo.offsetHeight};
     const lift=document.querySelector('[data-export-foil-lift]');
     const liftStyle=lift instanceof HTMLElement ? getComputedStyle(lift) : null;
     const shadow=liftStyle?.boxShadow||'';
     if(!shadow || shadow==='none') return {ok:false,reason:'no lift shadow'};
     const hitStyle=hit instanceof HTMLElement ? getComputedStyle(hit) : null;
     if(hitStyle && hitStyle.boxShadow!=='none' && hitStyle.boxShadow!=='') return {ok:false,reason:'hit still shadowed'};
     if(hitStyle && parseFloat(hitStyle.paddingTop||'0')<32) return {ok:false,reason:'hit pad '+hitStyle.paddingTop};
     const cv=document.createElement('canvas');
     cv.width=cv.height=8;
     const g=cv.getContext('2d');
     if(!g) return {ok:false,reason:'canvas'};
     const luma=(r,gch,b)=>0.2126*r+0.7152*gch+0.0722*b;
     const inks=[[40,160,40],[48,112,200],[220,72,40],[248,208,48],[196,164,120],[118,22,28]];
     let lastChroma=0;
     let lastLuma=0;
     let shifted=false;
     for(const base of inks){
       g.globalCompositeOperation='source-over';
       g.globalAlpha=1;
       g.fillStyle='rgb('+base[0]+','+base[1]+','+base[2]+')';
       g.fillRect(0,0,8,8);
       g.globalCompositeOperation='hue';
       g.fillStyle='hsl(2, 100%, 73%)';
       g.fillRect(0,0,8,8);
       const ink=g.getImageData(4,4,1,1).data;
       const baseChroma=Math.max(base[0],base[1],base[2])-Math.min(base[0],base[1],base[2]);
       const inkChroma=Math.max(ink[0],ink[1],ink[2])-Math.min(ink[0],ink[1],ink[2]);
       const lumaDelta=Math.abs(luma(ink[0],ink[1],ink[2])-luma(base[0],base[1],base[2]));
       const wall=ink[0]===0||ink[0]===255||ink[1]===0||ink[1]===255||ink[2]===0||ink[2]===255;
       if(inkChroma<Math.round(baseChroma*0.85) && !wall) return {ok:false,reason:'ink washed '+base.join(',')+' '+inkChroma};
       if(Math.abs(ink[0]-base[0])+Math.abs(ink[1]-base[1])+Math.abs(ink[2]-base[2])>=16) shifted=true;
       lastChroma=inkChroma;
       lastLuma=lumaDelta;
     }
     if(!shifted) return {ok:false,reason:'ink unchanged'};
     return {ok:true,reason:'hue-ink '+opacity.toFixed(2)+' foil='+foil.toFixed(2)+' ink='+lastChroma+' lumaΔ='+lastLuma.toFixed(1)};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
}

async function pokeExportCorner(s: Session): Promise<void> {
  await s.evalJson(
    `const hit=document.querySelector('[data-export-tilt-hit]');
     if(!(hit instanceof HTMLElement)) return false;
     const r=hit.getBoundingClientRect();
     const x=r.left+r.width*0.82;
     const y=r.top+r.height*0.18;
     hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',pointerId:1}));
     hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x+16,clientY:y,pointerType:'mouse',pointerId:1}));
     return true;`,
  ).catch(() => false);
  await sleep(200);
}

async function closeExportOverlay(s: Session): Promise<void> {
  await s.evalJson(`const b=document.querySelector('[data-export-scrim] button'); if(b instanceof HTMLElement) b.click(); return true;`).catch(() => false);
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const open = await s.evalJson<boolean>(`return !!document.querySelector('[data-export-preview-layer]');`).catch(() => false);
    if (!open) return;
    await sleep(150);
  }
}

async function measureSharedExportFoil(s: Session): Promise<{
  img: boolean;
  maps: boolean;
  rainbow: { ok: boolean; reason: string };
  hypot: number;
  orbit: string;
}> {
  const img = await waitForDexPreviewImg(s);
  const maps = await waitForFoilMaps(s);
  await pokeExportCorner(s);
  const rainbow = await readInkOnlyRainbow(s);
  const pose = await s.evalJson<{ hypot: number; orbit: string }>(
    `const card=document.querySelector('[data-export-preview]');
     const x=Number(card?.getAttribute('data-tilt-x')||0);
     const y=Number(card?.getAttribute('data-tilt-y')||0);
     return {hypot:Math.hypot(x,y),orbit:card?.getAttribute('data-export-orbit')||''};`,
  ).catch(() => ({ hypot: 0, orbit: '' }));
  return { img, maps, rainbow, hypot: pose.hypot, orbit: pose.orbit };
}

async function readDexPreviewMotion(s: Session): Promise<{
  x: number;
  y: number;
  hypot: number;
  foil: number;
  orbit: string;
  paused: string;
  scale: string;
  light: number;
  holo: number;
  maps: string;
  top: number;
  left: number;
  width: number;
  height: number;
  perspective: string;
  transformStyle: string;
}> {
  return s.evalJson(
    `const el=document.querySelector('[data-export-preview]');
     const hit=document.querySelector('[data-export-tilt-hit]');
     const light=document.querySelector('[data-foil-layer="pointLight"]');
     const holo=document.querySelector('[data-foil-layer="holographic"]');
     const x=Number(el?.getAttribute('data-tilt-x')||0);
     const y=Number(el?.getAttribute('data-tilt-y')||0);
     const r=el instanceof HTMLElement ? el.getBoundingClientRect() : {top:0,left:0,width:0,height:0};
     const hitStyle=hit instanceof HTMLElement ? getComputedStyle(hit) : null;
     const stage=hit instanceof HTMLElement ? hit.parentElement : null;
     const stageStyle=stage instanceof HTMLElement ? getComputedStyle(stage) : null;
     return {
       x, y,
       hypot: Math.hypot(x,y),
       foil: Number(el?.getAttribute('data-foil-opacity')||0),
       orbit: el?.getAttribute('data-export-orbit')||'',
       paused: el?.getAttribute('data-paused')||'',
       scale: el?.getAttribute('data-tilt-scale')||'',
       light: light ? Number(getComputedStyle(light).opacity) : 0,
       holo: holo ? Number(getComputedStyle(holo).opacity) : 0,
       maps: el?.getAttribute('data-foil-maps')||'',
       top: r.top, left: r.left, width: r.width, height: r.height,
       perspective: stageStyle?.perspective || '',
       transformStyle: hitStyle?.transformStyle || '',
     };`,
  ).catch(() => ({
    x: 0, y: 0, hypot: 0, foil: 0, orbit: '', paused: '', scale: '', light: 0, holo: 0, maps: '',
    top: 0, left: 0, width: 0, height: 0, perspective: '', transformStyle: '',
  }));
}

/** A person often already has the cursor over the card. That must not freeze idle. */
async function sitCursorOnDexPreview(s: Session): Promise<void> {
  await s.evalJson(
    `const hit=document.querySelector('[data-export-tilt-hit]');
     if(!(hit instanceof HTMLElement)) return false;
     const r=hit.getBoundingClientRect();
     const x=r.left+r.width/2;
     const y=r.top+r.height/2;
     const opts={bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',pointerId:1};
     hit.dispatchEvent(new PointerEvent('pointermove', opts));
     hit.dispatchEvent(new PointerEvent('pointermove', opts));
     return true;`,
  ).catch(() => false);
}

function visualTiltDelta(
  a: { top: number; left: number; width: number; height: number },
  b: { top: number; left: number; width: number; height: number },
): number {
  return Math.hypot(b.top - a.top, b.left - a.left, b.width - a.width, b.height - a.height);
}

export async function runDexExportSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  await s.click('[data-nav="view"]');
  await waitForActiveView(s, 'view');
  const hasTrigger = await s.evalJson<boolean>(`return !!document.querySelector('[data-dex-export]');`).catch(() => false);
  if (!hasTrigger) {
    return [ok('dex-export:preview-overlay', false, 'missing [data-dex-export]')];
  }
  await s.click('[data-dex-export]');
  await sleep(500);
  const state = await s.evalJson<{
    preview: boolean;
    confirm: boolean;
    surveyHost: boolean;
    shell: boolean;
    outlines: boolean;
  }>(
    `return {
      preview: !!document.querySelector('[data-export-preview-layer]'),
      confirm: !!document.querySelector('[data-dex-export-confirm]'),
      surveyHost: !!document.querySelector('[data-export-survey-host]'),
      shell: !!document.querySelector('[data-export-shell], [data-export-chrome]'),
      outlines: !!document.querySelector('[data-export-outlines]'),
    };`,
  ).catch(() => ({ preview: false, confirm: false, surveyHost: true, shell: false, outlines: false }));
  const imgReady = await waitForDexPreviewImg(s);
  const mapsOnOpen = await waitForFoilMaps(s);
  const rainbowOnOpen = await readInkOnlyRainbow(s);
  // Do not move the Playwright mouse. Sit a stationary cursor on the card,
  // the way a person often has it, then require the painted box to change.
  await sitCursorOnDexPreview(s);
  const idleWait = Date.now();
  let idleA = await readDexPreviewMotion(s);
  while (Date.now() - idleWait < 8000 && idleA.hypot <= 2.5) {
    await sleep(200);
    idleA = await readDexPreviewMotion(s);
  }
  await sleep(2500);
  const idleB = await readDexPreviewMotion(s);
  const idleDelta = Math.hypot(idleB.x - idleA.x, idleB.y - idleA.y);
  const visualDelta = visualTiltDelta(idleA, idleB);
  const perspectiveOn = idleA.perspective.startsWith('600') && idleB.transformStyle.includes('preserve-3d');
  const idleMoved =
    idleA.orbit === 'idle' &&
    idleB.orbit === 'idle' &&
    Math.max(idleA.hypot, idleB.hypot) > 2.5 &&
    perspectiveOn &&
    (idleDelta > 2 || visualDelta > 4 || Math.min(idleA.hypot, idleB.hypot) > 4);
  const idleAlign =
    idleA.hypot * idleB.hypot > 0
      ? Math.abs(idleA.x * idleB.x + idleA.y * idleB.y) / (idleA.hypot * idleB.hypot)
      : 1;
  const idleCircular = idleMoved && idleAlign < 0.85;
  await s.screenshot(ctx.shot('dex-export-overlay'));
  const tiltedFit = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     const layer=document.querySelector('[data-export-preview-layer]');
     if(!(card instanceof HTMLElement) || !(layer instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const c=card.getBoundingClientRect(); const l=layer.getBoundingClientRect();
     if(c.left<l.left-4||c.right>l.right+4||c.top<l.top-4||c.bottom>l.bottom+4) return {ok:false,reason:'layer'};
     if(c.left<-4||c.top<-4||c.right>innerWidth+4||c.bottom>innerHeight+4) return {ok:false,reason:'viewport'};
     return {ok:true,reason:''};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  const shineMotion = idleB.foil >= idleA.foil ? idleB : idleA;
  let shineSample = shineMotion;
  let shineOn = shineSample.foil > 0.1 && shineSample.holo > 0.05;
  for (let i = 0; i < 12 && !shineOn; i++) {
    await sleep(150);
    shineSample = await readDexPreviewMotion(s);
    shineOn = shineSample.foil > 0.1 && shineSample.holo > 0.05;
  }
  const hoverPts: Array<[number, number]> = [
    [0.18, 0.18],
    [0.82, 0.18],
    [0.82, 0.82],
    [0.18, 0.82],
    [0.5, 0.12],
    [0.82, 0.5],
    [0.18, 0.5],
  ];
  const widths: number[] = [];
  let hoverMax = 0;
  let hoverOrbit = '';
  let hoverScale = '';
  for (const [u, v] of hoverPts) {
    const step = await s
      .evalJson<{ w: number; hypot: number; orbit: string; scale: string }>(
        `const hit=document.querySelector('[data-export-tilt-hit]');
         const card=document.querySelector('[data-export-preview]');
         if(!(hit instanceof HTMLElement) || !(card instanceof HTMLElement)) return {w:0,hypot:0,orbit:'',scale:''};
         const r=hit.getBoundingClientRect();
         hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:r.left+r.width*${u},clientY:r.top+r.height*${v},pointerType:'mouse',pointerId:1}));
         return {w:card.offsetWidth,hypot:Math.hypot(Number(card.dataset.tiltX||0),Number(card.dataset.tiltY||0)),orbit:card.getAttribute('data-export-orbit')||'',scale:card.getAttribute('data-tilt-scale')||''};`,
      )
      .catch(() => ({ w: 0, hypot: 0, orbit: '', scale: '' }));
    widths.push(step.w);
    hoverMax = Math.max(hoverMax, step.hypot);
    hoverOrbit = step.orbit;
    hoverScale = step.scale;
    await sleep(160);
  }
  const widthDelta = widths.length ? Math.max(...widths) - Math.min(...widths) : 99;
  const viewW = await s.evalJson<number>(`return innerWidth`).catch(() => 1280);
  const desktop = viewW >= 1024;
  const hoverCircle = {
    ok: hoverScale === '1' && widthDelta < 2 && hoverMax > 2.4 && hoverOrbit === 'pointer' && (desktop ? hoverMax < 4.0 : hoverMax <= 4.6),
    reason: `scale=${hoverScale} dW=${widthDelta} hypot=${hoverMax.toFixed(1)} orbit=${hoverOrbit} w=${viewW}`,
  };
  await s.evalJson(
    `const hit=document.querySelector('[data-export-tilt-hit]');
     if(!(hit instanceof HTMLElement)) return false;
     const r=hit.getBoundingClientRect();
     const x=r.left+r.width*0.82;
     const y=r.top+r.height*0.18;
     hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',pointerId:1}));
     hit.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x+16,clientY:y,pointerType:'mouse',pointerId:1}));
     return true;`,
  ).catch(() => false);
  await sleep(200);
  await waitForFoilMaps(s);
  const rainbow = await readInkOnlyRainbow(s);
  const readShadowX = async () =>
    s.evalJson<number>(
      `const card=document.querySelector('[data-export-preview]');
       return Number(card instanceof HTMLElement ? card.getAttribute('data-shadow-x')||0 : 0);`,
    ).catch(() => 0);
  const fireShadow = async (u: number, v: number, want: 'neg' | 'pos') => {
    await s.evalJson(
      `const hit=document.querySelector('[data-export-tilt-hit]');
       if(!(hit instanceof HTMLElement)) return false;
       const r=hit.getBoundingClientRect();
       const x=r.left+r.width*${u};
       const y=r.top+r.height*${v};
       document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x,clientY:y,pointerType:'mouse',pointerId:1}));
       document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:x+16,clientY:y,pointerType:'mouse',pointerId:1}));
       return true;`,
    ).catch(() => false);
    const t0 = Date.now();
    let val = await readShadowX();
    while (Date.now() - t0 < 800) {
      if (want === 'neg' && val < -0.2) return val;
      if (want === 'pos' && val > 0.2) return val;
      await sleep(50);
      val = await readShadowX();
    }
    return val;
  };
  const leftShadow = await fireShadow(0.12, 0.5, 'neg');
  const rightShadow = await fireShadow(0.88, 0.5, 'pos');
  const shadowPainted = await s.evalJson<{ ok: boolean; reason: string }>(
    `const hit=document.querySelector('[data-export-tilt-hit]');
     const lift=document.querySelector('[data-export-foil-lift]');
     const card=document.querySelector('[data-export-preview]');
     const layer=document.querySelector('[data-export-preview-layer]');
     if(!(hit instanceof HTMLElement) || !(lift instanceof HTMLElement) || !(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const liftCs=getComputedStyle(lift);
     const hitCs=getComputedStyle(hit);
     const cardCs=getComputedStyle(card);
     const layerCs=layer instanceof HTMLElement ? getComputedStyle(layer) : null;
     const stageCs=hit.parentElement instanceof HTMLElement ? getComputedStyle(hit.parentElement) : null;
     if(!liftCs.boxShadow || liftCs.boxShadow==='none') return {ok:false,reason:'lift shadow none'};
     if(hitCs.boxShadow!=='none') return {ok:false,reason:'hit still shadowed'};
     if(cardCs.boxShadow!=='none') return {ok:false,reason:'card shadowed'};
     if(liftCs.overflow!=='visible') return {ok:false,reason:'lift overflow '+liftCs.overflow};
     if(hitCs.overflow!=='visible') return {ok:false,reason:'hit overflow '+hitCs.overflow};
     if(stageCs && stageCs.overflow!=='visible') return {ok:false,reason:'stage overflow '+stageCs.overflow};
     if(layerCs && layerCs.overflow!=='visible') return {ok:false,reason:'layer overflow '+layerCs.overflow};
     const pad=parseFloat(hitCs.paddingTop||'0');
     if(pad<32) return {ok:false,reason:'hit pad '+pad};
     if(hitCs.backgroundColor!=='rgba(0, 0, 0, 0)' && hitCs.backgroundColor!=='transparent' && hitCs.backgroundColor!=='rgba(0,0,0,0)') return {ok:false,reason:'hit fill '+hitCs.backgroundColor};
     const opacity=Number(getComputedStyle(hit).getPropertyValue('--hover-tilt-shadow-opacity')||hit.getAttribute('data-shadow-opacity')||0);
     if(!(opacity>0.08) || opacity>0.13) return {ok:false,reason:'opacity '+opacity};
     return {ok:true,reason:'lift-unclipped op='+opacity.toFixed(2)+' pad='+pad};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  const shadowPair = {
    ok: rightShadow > leftShadow + 0.2 && shadowPainted.ok,
    reason: `${leftShadow.toFixed(2)} → ${rightShadow.toFixed(2)} ${shadowPainted.reason}`,
  };
  const cornerMargin = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     const layer=document.querySelector('[data-export-preview-layer]');
     if(!(card instanceof HTMLElement) || !(layer instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const c=card.getBoundingClientRect(); const l=layer.getBoundingClientRect();
     const layerGap=Math.min(c.left-l.left,l.right-c.right,c.top-l.top,l.bottom-c.bottom);
     const viewGap=Math.min(c.left,c.top,innerWidth-c.right,innerHeight-c.bottom);
     const min=Math.min(layerGap,viewGap);
     return {ok:min>=24,reason:'gap '+min.toFixed(1)};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  const paintedHit = await s.evalJson<{ ok: boolean; reason: string }>(
    `const hit=document.querySelector('[data-export-tilt-hit]');
     const card=document.querySelector('[data-export-preview]');
     if(!(hit instanceof HTMLElement) || !(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const painted=card.getBoundingClientRect();
     const rest={left:hit.getBoundingClientRect().left+8,top:hit.getBoundingClientRect().top+8,right:hit.getBoundingClientRect().right-8,bottom:hit.getBoundingClientRect().bottom-8};
     const candidates=[[painted.left+2,(painted.top+painted.bottom)/2],[painted.right-2,(painted.top+painted.bottom)/2],[ (painted.left+painted.right)/2,painted.top+2]];
     let probe=null;
     for(const [x,y] of candidates){
       const inRest=x>=rest.left&&x<=rest.right&&y>=rest.top&&y<=rest.bottom;
       const inPaint=x>=painted.left&&x<=painted.right&&y>=painted.top&&y<=painted.bottom;
       if(inPaint&&!inRest){probe={x,y};break;}
     }
     if(!probe){
       probe={x:painted.left+painted.width*0.92,y:painted.top+painted.height*0.12};
     }
     document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:probe.x,clientY:probe.y,pointerType:'mouse',pointerId:1}));
     const orbit=card.getAttribute('data-export-orbit')||'';
     const hypot=Math.hypot(Number(card.dataset.tiltX||0),Number(card.dataset.tiltY||0));
     return {ok:orbit==='pointer'&&hypot>2,reason:orbit+' hypot='+hypot.toFixed(1)+' probe='+probe.x.toFixed(0)+','+probe.y.toFixed(0)};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  const restStatic = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     if(!(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:12,clientY:12,pointerType:'mouse',pointerId:1}));
     return {ok:true,reason:card.getAttribute('data-export-orbit')||''};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  await sleep(350);
  const restHold = await readDexPreviewMotion(s);
  let restAfter = restHold;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    restAfter = await readDexPreviewMotion(s);
    if (restAfter.orbit === 'idle' && restAfter.hypot > 2) break;
  }
  const restOk =
    restHold.orbit !== 'pointer' &&
    restAfter.orbit === 'idle' &&
    restAfter.hypot > 2 &&
    (desktop ? restAfter.hypot <= 3.8 : restAfter.hypot <= 4.6);
  await s.screenshot(ctx.shot('dex-export-hover'));
  await s.click('[data-export-tilt-hit]').catch(() => undefined);
  await sleep(500);
  const locked = await readDexPreviewMotion(s);
  const fill = await s.evalJson<{ ok: boolean; reason: string; ratio: number }>(
    `const card=document.querySelector('[data-export-preview]');
     const layer=document.querySelector('[data-export-preview-layer]');
     if(!(card instanceof HTMLElement) || !(layer instanceof HTMLElement)) return {ok:false,reason:'missing',ratio:0};
     const c=card.getBoundingClientRect(); const l=layer.getBoundingClientRect();
     const ratio=Math.max(c.width/Math.max(1,l.width), c.height/Math.max(1,l.height));
     if(c.left<l.left-4||c.right>l.right+4||c.top<l.top-4||c.bottom>l.bottom+4) return {ok:false,reason:'overflow',ratio};
     return {ok:ratio>=0.78,reason:'cover '+ratio.toFixed(3),ratio};`,
  ).catch(() => ({ ok: false, reason: 'eval', ratio: 0 }));
  const corners = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     if(!(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const style=getComputedStyle(card);
     const bg=style.backgroundColor.replace(/\\s+/g,'');
     const clip=style.getPropertyValue('clip-path')+' '+style.getPropertyValue('-webkit-clip-path');
     const transparent=bg==='transparent'||bg==='rgba(0,0,0,0)'||bg==='rgba(0,0,0,0.0)';
     if(!transparent) return {ok:false,reason:'corner fill '+bg};
     if(!/round/i.test(clip)) return {ok:false,reason:'clip '+clip};
     if(card.className.includes('bg-white')) return {ok:false,reason:'bg-white'};
     return {ok:true,reason:bg};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  const shineClip = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     if(!(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const style=getComputedStyle(card);
     if(style.overflow!=='hidden') return {ok:false,reason:'overflow '+style.overflow};
     const bloom=document.querySelector('[data-foil-layer="bloom"]');
     if(bloom instanceof HTMLElement){
       const inset=getComputedStyle(bloom).inset;
       if(inset.includes('-')) return {ok:false,reason:'bloom inset '+inset};
     }
     const holo=document.querySelector('[data-foil-layer="holographic"]');
     if(!(holo instanceof HTMLElement)) return {ok:false,reason:'no holo'};
     const holoStyle=getComputedStyle(holo);
     const mask=(holoStyle.getPropertyValue('-webkit-mask-image')+' '+holoStyle.getPropertyValue('mask-image')).replace(/\\s+/g,' ').trim();
     if(!mask.includes('url(')) return {ok:false,reason:'holo unmasked'};
     const c=card.getBoundingClientRect();
     for(const layer of card.querySelectorAll('[data-foil-layer]')){
       if(!(layer instanceof HTMLElement)) continue;
       const r=layer.getBoundingClientRect();
       if(r.left<c.left-2||r.right>c.right+2||r.top<c.top-2||r.bottom>c.bottom+2){
         return {ok:false,reason:'layer-overflow '+(layer.dataset.foilLayer||'')};
       }
     }
     const holoAmt=Number(style.getPropertyValue('--foil-holographic'));
     if(Math.abs(holoAmt-0.25)>0.02) return {ok:false,reason:'holo amount '+holoAmt};
     return {ok:true,reason:bloom?'ink-holo-clipped':'ink-holo'};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  await s.screenshot(ctx.shot('dex-export-locked'));
  const confirmReady = await s.evalJson<boolean>(
    `try { Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}); } catch {}
     const b=document.querySelector('[data-dex-export-confirm]');
     return b instanceof HTMLButtonElement && !b.disabled;`,
  ).catch(() => false);
  if (confirmReady) {
    await s.click('[data-dex-export-confirm]').catch(() => undefined);
  }
  let sprite = { ok: false, reason: 'missing', devicePx: 0, native: 96 };
  const surveyWait = Date.now();
  while (Date.now() - surveyWait < 20000) {
    sprite = await s.evalJson(
      `const img=document.querySelector('[data-export-survey-sprite]');
       if(!(img instanceof HTMLImageElement)) return {ok:false,reason:'missing',devicePx:0,native:96};
       const r=img.getBoundingClientRect();
       const dpr=window.devicePixelRatio||1;
       const devicePx=r.width*dpr;
       const native=img.naturalWidth||96;
       if(devicePx+0.5<native) return {ok:false,reason:'downscale '+devicePx,devicePx,native};
       const multiple=devicePx/native;
       const integer=Math.abs(multiple-Math.round(multiple))<0.06;
       const minMultiple=innerWidth<1024?1.94:0.94;
       const attr=Number(img.getAttribute('data-sprite-scale')||0);
       const sized=integer && multiple>=minMultiple && attr>=(innerWidth<1024?2:1);
       return {ok:sized,reason:(sized?'ok ':'small ')+multiple.toFixed(3)+' attr='+attr,devicePx,native};`,
    ).catch(() => ({ ok: false, reason: 'eval', devicePx: 0, native: 96 }));
    if (sprite.ok || sprite.reason !== 'missing') break;
    await sleep(250);
  }
  await s.screenshot(ctx.shot('dex-export-survey'));
  await s.evalJson(`const b=document.querySelector('[data-export-scrim] button'); if(b instanceof HTMLElement) b.click(); return true;`).catch(() => false);
  await sleep(300);
  return [
    ok('dex-export:preview-overlay', state.preview && state.confirm && !state.surveyHost && state.shell, JSON.stringify(state)),
    ok('dex-export:card-in-view', tiltedFit.ok, tiltedFit.reason),
    ok('dex-export:outlines-row', state.outlines, 'missing [data-export-outlines]'),
    ok('dex-export:auto-tilt', imgReady && idleMoved, JSON.stringify({ idleA, idleB, idleDelta, visualDelta, perspectiveOn })),
    ok('dex-export:idle-circular', imgReady && idleCircular, JSON.stringify({ idleA, idleB, idleAlign, idleDelta })),
    ok('dex-export:hover-no-scale', hoverCircle.ok, hoverCircle.reason),
    ok('dex-export:tilt-magnitude', hoverCircle.ok && (desktop ? hoverMax <= 3.8 : hoverMax > 3.8 && hoverMax <= 4.6), `hypot=${hoverMax.toFixed(1)} w=${viewW}`),
    ok('dex-export:dynamic-shadow', shadowPair.ok, shadowPair.reason),
    ok('dex-export:tilt-corner-margin', cornerMargin.ok, cornerMargin.reason),
    ok('dex-export:tilt-on-painted', paintedHit.ok, paintedHit.reason),
    ok('dex-export:tilt-park-idle', restOk, `hold=${restHold.orbit}/${restHold.hypot.toFixed(1)} after=${restAfter.orbit}/${restAfter.hypot.toFixed(1)} ${restStatic.reason}`),
    ok('dex-export:shine', imgReady && shineOn, JSON.stringify(shineSample)),
    ok('dex-export:rainbow-on-open', imgReady && mapsOnOpen && rainbowOnOpen.ok, rainbowOnOpen.reason),
    ok('dex-export:rainbow-foil', rainbow.ok, rainbow.reason),
    ok('dex-export:shine-clip', shineClip.ok, shineClip.reason),
    ok('dex-export:lock-on-press', locked.paused === '1' && locked.hypot < 0.8, JSON.stringify(locked)),
    ok('dex-export:card-fill', fill.ok, fill.reason),
    ok('dex-export:no-corner-mask', corners.ok, corners.reason),
    ok('dex-export:survey-sprite-scale', sprite.ok, `${sprite.reason} device=${sprite.devicePx.toFixed(1)} native=${sprite.native}`),
  ];
}

// ---------------------------------------------------------------------------
// League builder page (/custom-gym-leader), added 2026-08-29. Checks are
// the invariants that change introduced: the page boots on its own entry, the
// served HTML carries the static SEO content, layout holds, a real drive
// writes the league's own store key, and the run stays error-free. The drive
// runs on desktop-width Blink (the instant-add path); other surfaces prove
// boot, layout, and rendering.
const LEAGUE_PATH = '/custom-gym-leader';
const LEAGUE_KEY = 'league-builder';

interface LeagueOracle {
  has: boolean;
  cardType: string | null;
  lineCount: number;
  tm: number | null;
}

async function readLeagueOracle(s: Session, cardIndex: number): Promise<LeagueOracle> {
  return s
    .evalJson<LeagueOracle>(
      `const raw=localStorage.getItem(${JSON.stringify(LEAGUE_KEY)});
       if(!raw) return {has:false,cardType:null,lineCount:0,tm:null};
       try { const d=JSON.parse(raw); const c=d.state?.cards?.[${cardIndex}];
         return {has:true, cardType:c?.type??null, lineCount:c?.lines?.length??0, tm:c?.tmMoveId??null};
       } catch { return {has:false,cardType:null,lineCount:0,tm:null}; }`,
    )
    .catch(() => ({ has: false, cardType: null, lineCount: 0, tm: null }));
}

export async function runLeagueSuite(s: Session, persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;

  // The served HTML must carry the static SEO content (crawlers see no JS).
  // Fetched host-side so the check reads the wire bytes, not the DOM.
  try {
    const res = await fetch(url);
    const html = await res.text();
    const hasH1 = /<h1[^>]*>[^<]*League Builder/i.test(html);
    const hasTitle = /<title>[^<]*League Builder/i.test(html);
    if (!res.ok) {
      // A non-200 is a real server failure, not a missing feature.
      checks.push(ok('league:static-seo-content', false, `status ${res.status}`));
      return checks;
    }
    if (!hasH1 || !hasTitle) {
      // The league builder page is not in this build yet: /custom-gym-leader
      // serves the SPA fallback (dex HTML, 200). Skip loudly rather than fail,
      // matching the placement check's skip-until-present rule; a check that flags
      // a not-yet-built feature is a false failure on the current app.
      checks.push({ name: 'league:static-seo-content', status: 'skip', detail: `league builder not in this build yet (SPA fallback at ${LEAGUE_PATH}, h1=${hasH1}, title=${hasTitle})` });
      return checks;
    }
    checks.push(ok('league:static-seo-content', true, `status ${res.status}`));
  } catch (e) {
    checks.push({ name: 'league:static-seo-content', status: 'fail', detail: (e as Error).message });
    return checks;
  }

  await s.navigate(url);
  // waitForApp is satisfied by the static SEO shell too (it also fills #root),
  // so hydration is proven by polling for an app-only handle.
  let hydrated = false;
  for (let i = 0; i < 40 && !hydrated; i++) {
    hydrated = await s
      .evalJson<boolean>(`return !!document.querySelector('[data-testid="league-slot-0"]');`)
      .catch(() => false);
    if (!hydrated) await sleep(250);
  }
  checks.push(ok('league:hydrated-league-home', hydrated));
  await s.screenshot(ctx.shot('league-home'));
  if (hydrated) checks.push(await auditRender(s, 'league:render-no-clipped-content'));

  const layout = await s.evalJson<{ scrollWidth: number; innerWidth: number; bodyH: number }>(LAYOUT);
  checks.push(ok('league:no-horizontal-overflow', layout.scrollWidth <= layout.innerWidth + 2, `scrollWidth ${layout.scrollWidth} vs innerWidth ${layout.innerWidth}`));

  // The league's tool bar holds the dex bar's 44px, home and (where the
  // desktop pane shows it) card page alike.
  // h-11 = 2.75rem; the expected pixels follow the root font-size knob.
  // Both bars carry a stable handle. Reading up the tree from a control
  // inside them broke the moment the name field grew its own border.
  const bars = await s.evalJson<{ home: number; card: number; expected: number }>(
    `const b=[...document.querySelectorAll('[data-testid="league-tool-bar"]')];
     const height=(el)=>el?el.getBoundingClientRect().height:-1;
     const root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
     return {home:height(b[0]),card:height(b.length>1?b[b.length-1]:null),expected:2.75*root};`,
  );
  const barOk = (v: number) => v === -1 || Math.abs(v - bars.expected) < 1.5;
  checks.push(
    ok(
      'league:tool-bar-height',
      Math.abs(bars.home - bars.expected) < 1.5 && barOk(bars.card),
      `home ${bars.home}px, card ${bars.card === -1 ? 'n/a' : `${bars.card}px`}, expected ${bars.expected.toFixed(1)}px`,
    ),
  );

  // The real drive: open a card, set its type, seat a line, pick a TM. The
  // pickers and instant-add flow are desktop-shaped; personas and other
  // engines stop at rendering.
  if (s.engine === 'blink' && persona === null && hydrated) {
    const CARD = 3;
    // A first visit seeds a Kanto league, and the drive wants an empty
    // card: a type to set and one line to seat. Start from a blank league,
    // written to the store and reloaded, as the change suite below does.
    await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${BLANK_LEAGUE}); return true;`);
    await s.navigate(url);
    await waitLeagueHome(s);
    const dexBefore = await readSeedCount(s);
    await s.click(`[data-testid="league-slot-${CARD}"]`);
    await sleep(400);
    await s.click('[aria-label^="Gym type"]');
    await sleep(300);
    await s.click('svg[data-type="water"]');
    await sleep(400);
    await s.click('[data-testid="card-cell-1-1"]');
    await sleep(900);
    const searched = await s
      .evalJson<boolean>(`const i=[...document.querySelectorAll('input')].find(x=>x.placeholder&&x.type!=='hidden'&&x.closest('[class*="flex-col"]'));return !!i;`)
      .catch(() => false);
    // Type into the browser's search box (the last text input on the page).
    await s.evalJson(`const is=[...document.querySelectorAll('input')]; const i=is[is.length-1];
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(i,'chinchou'); i.dispatchEvent(new Event('input',{bubbles:true})); return ${JSON.stringify('ok')};`);
    await sleep(900);
    await s.click(PLACE_CARD);
    await sleep(700);
    await s.screenshot(ctx.shot('league-card-driven'));
    checks.push(await auditRender(s, 'league:card-render-no-clipped-content'));
    const oracle = await readLeagueOracle(s, CARD);
    checks.push(ok('league:drive-writes-store', oracle.has && oracle.cardType === 'water' && oracle.lineCount === 1,
      `searched=${searched} type=${oracle.cardType} lines=${oracle.lineCount}`));

    // The drive must not have touched the dex store's placements.
    const dexAfter = await readSeedCount(s);
    checks.push(ok('league:dex-store-untouched', dexAfter === dexBefore, `dex count ${dexBefore} -> ${dexAfter}`));
  } else {
    checks.push({
      name: 'league:drive-writes-store',
      status: 'skip',
      detail: hydrated ? 'desktop-width Blink only' : 'page never hydrated, drive not attempted',
    });
  }

  const errs = await s.errors();
  checks.push(ok('league:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));
  return checks;
}

// ---------------------------------------------------------------------------
// The league builder's 2026-09-02/03 changes, driven as the user meets them:
// the one-Pokémon pickers name their slot and pack a chain wider than the
// grid without a gap; a powerup press carries the rows it filled and a
// second seat fills down too; the replace picker takes a line already on
// the card; and a quick flick moves an evolution boundary, washing the
// moving stage while it moves. Handles are structural (test ids, the
// league store, computed style). The flick is a synthetic touch, so it
// drives the card's own sensor on every engine that exposes `TouchEvent`,
// and skips by name on one that does not.

const BLANK_LEAGUE =
  "JSON.stringify({state:{name:'',cards:Array.from({length:14},()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null}))},version:1})";

async function waitLeagueHome(s: Session): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    const hydrated = await s.evalJson<boolean>(`return !!document.querySelector('[data-testid="league-slot-0"]');`).catch(() => false);
    if (hydrated) return true;
    await sleep(250);
  }
  return false;
}

async function waitFor(s: Session, selector: string, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const there = await s.evalJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`).catch(() => false);
    if (there) return true;
    await sleep(200);
  }
  return false;
}

/** Type into the picker's search box, which is the last text input on the page. */
async function searchPicker(s: Session, query: string): Promise<void> {
  await s.evalJson(`const is=[...document.querySelectorAll('input')]; const i=is[is.length-1];
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,${JSON.stringify(query)}); i.dispatchEvent(new Event('input',{bubbles:true})); return true;`);
  await sleep(900);
}

/** A card's lines and powerups, as the league store holds them. */
async function readCard(s: Session, card: number): Promise<{ lines: { branch: number[]; boundaries: number[] }[]; powerups: Record<string, { seat: number; kind: string; index: number }[]> }> {
  return s.evalJson(`const d=JSON.parse(localStorage.getItem(${JSON.stringify(LEAGUE_KEY)})||'{}'); const c=d.state?.cards?.[${card}]||{};
    return {lines:c.lines||[], powerups:c.powerups||{}};`);
}

/** Open a card from the league home; the home must be showing. */
async function openLeagueCard(s: Session, card: number): Promise<boolean> {
  await s.click(`[data-testid="league-slot-${card}"]`);
  const there = await waitFor(s, '[data-testid="card-cell-1-1"]');
  await sleep(500);
  return there;
}

/** Press a powerup button beside a cell, as the user does. */
async function pressPowerup(s: Session, row: number, seat: number, kind: 'mega' | 'dynamax'): Promise<boolean> {
  const pressed = await s.evalJson<boolean>(`const cell=document.querySelector('[data-testid="card-cell-${row}-${seat}"]');
    const b=cell&&cell.parentElement&&cell.parentElement.querySelector('[data-powerup="${kind}"]'); if(!b) return false; b.click(); return true;`);
  await sleep(400);
  return pressed;
}

const powerupOf = (card: Awaited<ReturnType<typeof readCard>>, row: number, seat: number) =>
  (card.powerups[String(row)] ?? []).find((p) => p.seat === seat) ?? null;

export async function runLeagueChangeSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;
  const CARD = 9;

  // A blank league, seeded through the store and reloaded, so the drive
  // starts from the same empty card on every engine.
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'league-change:blank-league', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${BLANK_LEAGUE}); return true;`);
  await s.navigate(url);
  const blank = (await waitLeagueHome(s)) && (await readCard(s, CARD)).lines.length === 0;
  checks.push(ok('league-change:blank-league', blank));
  if (!blank) return checks;

  if (await openLeagueCard(s, CARD)) {
    await sleep(s.engine === 'webkit' ? 1000 : 500);
    const labels = await s.evalJson<{
      partnerInside: boolean;
      partnerDetail: string;
      glyphOk: boolean;
      glyphDetail: string;
      badgeOneLine: boolean;
      badgeDetail: string;
    }>(`       const slot=document.querySelector('[data-ace-partner-slot]')||document.querySelector('[data-testid="slot-partner"]')?.parentElement;
       const head=document.querySelector('[data-slot-head="partner"]');
       const lines=[...head?.querySelectorAll('span.block')??[]];
       const last=lines[lines.length-1];
       const tm=document.querySelector('[data-testid="slot-tm"]');
       const disc=tm?.querySelector('svg');
       const badgeWord=document.querySelector('[data-mark-label="badge"]');
       const sr=slot?.getBoundingClientRect();
       const zoom=sr&&slot?sr.width/slot.offsetWidth:1;
       const pad=1;
       const range=document.createRange();
       if(last) range.selectNodeContents(last);
       const hr=last?range.getBoundingClientRect():null;
       const rawR=slot?getComputedStyle(slot).borderTopLeftRadius:'8px';
       let radius=parseFloat(rawR)||8;
       if(rawR.includes('rem')) radius*=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
       radius*=zoom;
       const pastRect=!(sr&&hr)||hr.left<sr.left-pad||hr.right>sr.right+pad||hr.top<sr.top-pad||hr.bottom>sr.bottom+pad;
       let pastCorner=false;
       if(sr&&hr&&hr.right>sr.right-radius&&hr.bottom>sr.bottom-radius&&radius>0){
         pastCorner=Math.hypot(hr.right-(sr.right-radius),hr.bottom-(sr.bottom-radius))>radius+pad;
       }
       const partnerInside=!!(sr&&hr)&&hr.width>0&&!pastRect&&!pastCorner
         &&lines.map(l=>(l.textContent||'').trim()).join('|')==='PARTNER /|SHOULDERMON';
       const root=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
       const tmR=tm?.getBoundingClientRect();
       const discW=disc?.getBoundingClientRect().width??0;
       const colCap=Math.min(2.75*root, 0.26*(tmR?.width??0));
       const cap=0.72*colCap+1.5;
       const glyphOk=discW>4&&discW<=cap;
       const bh=badgeWord?.getBoundingClientRect().height??0;
       const fs=badgeWord?parseFloat(getComputedStyle(badgeWord).fontSize)||8:8;
       const badgeOneLine=bh>0&&bh<=fs*1.65;
       return {
         partnerInside,
         partnerDetail: sr&&hr?('ink['+Math.round(hr.left)+','+Math.round(hr.top)+' '+Math.round(hr.width)+'x'+Math.round(hr.height)+'] slot['+Math.round(sr.left)+','+Math.round(sr.top)+' '+Math.round(sr.width)+'x'+Math.round(sr.height)+'] pad='+pad.toFixed(1)+' lines='+lines.map(l=>(l.textContent||'').trim()).join('|')):'missing',
         glyphOk,
         glyphDetail: 'discW='+discW.toFixed(1)+' cap='+cap.toFixed(1),
         badgeOneLine,
         badgeDetail: 'h='+bh.toFixed(1)+' fs='+fs.toFixed(1),
       };`).catch(() => null);
    if (labels) {
      checks.push(ok('league:partner-head-inside-slot', labels.partnerInside, labels.partnerDetail));
      checks.push(ok('league:mark-glyph-not-oversized', labels.glyphOk, labels.glyphDetail));
      checks.push(ok('league:badge-label-one-line', labels.badgeOneLine, labels.badgeDetail));
      await s.screenshot(ctx.shot('league-card-labels'));
    } else {
      checks.push(ok('league:partner-head-inside-slot', false, 'eval failed'));
    }

    await s.click('[data-testid="slot-ace"]');
    const pickerUp = await waitFor(s, '[data-filter-chip="my-dex"]');
    await sleep(600);
    const heading = await s.evalJson<string>(`const h=[...document.querySelectorAll('h2')].find(e=>/Adding to:/.test(e.textContent||''));
      if(h) return h.textContent.replace(/\\s+/g,' ').trim();
      const lead=[...document.querySelectorAll('span')].find(x=>(x.textContent||'').trim()==='Adding to:');
      return lead&&lead.parentElement?lead.parentElement.textContent.replace(/\\s+/g,' ').trim():'';`).catch(() => '');
    checks.push(ok('league-change:ace-picker-names-slot', pickerUp && /Ace Pok/.test(heading), heading || 'no heading found'));

    let eevee = false;
    for (let i = 0; i < 60 && !eevee; i++) {
      eevee = await s.evalJson<boolean>(`const scrollerOf=(el)=>{let n=el.parentElement;while(n){const oy=getComputedStyle(n).overflowY;if(oy==='auto'||oy==='scroll')return n;n=n.parentElement;}return null;};
        const img=document.querySelector('img[alt="eevee"]'); if(img){img.scrollIntoView({block:'center'});return true;}
        const cell=document.querySelector('[data-row-cell]'); const sc=cell?scrollerOf(cell):null; if(!sc) return false; sc.scrollTop+=sc.clientHeight*0.8; return false;`).catch(() => false);
      await sleep(150);
    }
    await sleep(400);
    const rows = await s.evalJson<string[][]>(`const img=document.querySelector('img[alt="eevee"]'); const grid=img&&img.closest('[data-row-cell]')&&img.closest('[data-row-cell]').parentElement; if(!grid) return [];
      const byTop=new Map(); for(const child of grid.children){ if(child.hasAttribute('aria-hidden')) continue; const top=Math.round(child.getBoundingClientRect().top);
        const sprite=[...child.querySelectorAll('img')].find(i=>(i.getAttribute('src')||'').includes('/sprites/pokemon/'));
        const label=child.hasAttribute('data-row-cell')?(sprite?sprite.getAttribute('alt'):'?'):'·'; if(!byTop.has(top)) byTop.set(top,[]); byTop.get(top).push(label);}
      return [...byTop.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);`).catch(() => [] as string[][]);
    const gapped = rows.filter((row) => row.some((c, i) => c === '·' && row.slice(i + 1).some((d) => d !== '·')));
    const omastar = rows.find((row) => row.includes('omastar'));
    const neighbour = omastar ? omastar[omastar.indexOf('omastar') + 1] : undefined;
    checks.push(ok('league-change:picker-rows-have-no-mid-row-gap', eevee && rows.length > 3 && gapped.length === 0, eevee ? `${rows.length} rows read, gapped: ${JSON.stringify(gapped)}` : 'Eevee never scrolled into view'));
    checks.push(ok('league-change:omastar-beside-kabuto', neighbour === 'kabuto', omastar ? omastar.join(', ') : 'no Omastar row rendered'));
    await s.screenshot(ctx.shot('league-change-ace-picker'));
  } else {
    checks.push({ name: 'league-change:ace-picker-names-slot', status: 'skip', detail: 'card never opened' });
  }

  // 2. Powerups: a second press carries the rows it filled; a second seat
  //    fills down like the first. Fresh page, so the picker is closed.
  await s.navigate(url);
  if ((await waitLeagueHome(s)) && (await openLeagueCard(s, CARD))) {
    await s.click('[data-testid="card-cell-1-1"]');
    await waitFor(s, '[data-filter-chip="my-dex"]');
    await sleep(600);
    await searchPicker(s, 'charizard');
    await s.click(PLACE_CARD);
    await sleep(700);
    let card = await readCard(s, CARD);
    const seated = card.lines.length === 1 && card.lines[0].branch.join() === '4,5,6';
    checks.push(ok('league-change:charizard-seated', seated, JSON.stringify(card.lines.map((l) => l.branch))));
    if (seated) {
      await s.navigate(url);
      await waitLeagueHome(s);
      await openLeagueCard(s, CARD);
      await pressPowerup(s, 10, 1, 'mega');
      await pressPowerup(s, 10, 1, 'mega');
      card = await readCard(s, CARD);
      const champion = powerupOf(card, 10, 1);
      const boss = powerupOf(card, 11, 1);
      checks.push(ok('league-change:second-press-carries-the-fill', champion?.index === 1 && boss?.index === 1, `champion ${JSON.stringify(champion)}, boss ${JSON.stringify(boss)}`));
      await s.screenshot(ctx.shot('league-change-charizard-y'));

      // A second seat, with a Mega already on the team.
      await s.click('[data-testid="card-cell-1-2"]');
      await waitFor(s, '[data-filter-chip="my-dex"]');
      await sleep(600);
      await searchPicker(s, 'lapras');
      await s.click(PLACE_CARD);
      await sleep(700);
      await s.navigate(url);
      await waitLeagueHome(s);
      await openLeagueCard(s, CARD);
      await pressPowerup(s, 10, 2, 'dynamax');
      card = await readCard(s, CARD);
      const two = card.lines.length === 2;
      const seat2 = [powerupOf(card, 10, 2), powerupOf(card, 11, 2)];
      checks.push(ok('league-change:second-seat-fills-down', two && seat2.every((p) => p?.kind === 'dynamax' && p.index === 0) && powerupOf(card, 10, 1)?.index === 1,
        `lines ${card.lines.length}, seat 2 rows 10/11 ${JSON.stringify(seat2)}, seat 1 champion ${JSON.stringify(powerupOf(card, 10, 1))}`));

      // 3. The replace picker takes a line already on the card: tap a
      //    Lapras cell, pick Charmander, and the seat holds Charizard's line.
      const tapped = await s.evalJson<string | null>(`const cells=[...document.querySelectorAll('[data-testid^="card-cell-"]')];
        const c=cells.find(el=>{const p=el.getAttribute('data-testid').split('-'); const row=Number(p[2]); const seat=Number(p[3]); const alt=el.querySelector('img')?el.querySelector('img').getAttribute('alt'):''; return seat===2&&row<11&&alt==='lapras';});
        if(!c) return null; c.click(); return c.getAttribute('data-testid');`).catch(() => null);
      const replaceUp = tapped !== null && (await waitFor(s, '[data-filter-chip="my-dex"]'));
      await sleep(600);
      if (replaceUp) {
        await searchPicker(s, 'charmander');
        await s.click(PLACE_CARD);
        await sleep(800);
      }
      card = await readCard(s, CARD);
      checks.push(ok('league-change:replace-with-placed-line', replaceUp && card.lines.map((l) => l.branch.join()).join('|') === '4,5,6|4,5,6',
        `tapped ${tapped}, lines ${JSON.stringify(card.lines.map((l) => l.branch))}`));

      // 4. A quick flick of Charizard's top cell two rows up, on the card's
      //    own touch sensor, with the wash read while the finger is down.
      await s.navigate(url);
      await waitLeagueHome(s);
      await openLeagueCard(s, CARD);
      // Detected by construction, not by name: an engine can expose the
      // constructors and still refuse the init dictionaries.
      const touch = await s.evalJson<boolean>(`try { const t=new Touch({identifier:1,target:document.body,clientX:0,clientY:0});
        new TouchEvent('touchstart',{bubbles:true,touches:[t],targetTouches:[t],changedTouches:[t]}); return true; } catch (e) { return false; }`).catch(() => false);
      const before = await readCard(s, CARD);
      const top = before.lines[0]?.boundaries[2] ?? 0;
      if (!touch) {
        checks.push({ name: 'league-change:flick-moves-stage', status: 'skip', detail: 'this engine cannot construct a Touch or TouchEvent; a real finger on a device is the only proof here' });
        checks.push({ name: 'league-change:flick-washes-the-stage', status: 'skip', detail: 'as above' });
      } else if (top < 4) {
        checks.push(ok('league-change:flick-moves-stage', false, `Charizard's run starts on row ${top}, no room to flick`));
      } else {
        const FLICK = `const from=document.querySelector('[data-testid="card-cell-${top}-1"]'); const to=document.querySelector('[data-testid="card-cell-${top - 2}-1"]');
          const a=from.getBoundingClientRect(), b=to.getBoundingClientRect(); const x=a.x+a.width/2, y0=a.y+a.height/2, y1=b.y+b.height/2;
          const at=(f)=>y0+(y1-y0)*f; const y=at(STEP);
          const t=new Touch({identifier:1,target:from,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y,radiusX:10,radiusY:10,force:1});
          const end=TYPE==='touchend'; const ev=new TouchEvent(TYPE,{bubbles:true,cancelable:true,composed:true,touches:end?[]:[t],targetTouches:end?[]:[t],changedTouches:[t]});
          from.dispatchEvent(ev); return document.querySelectorAll('[data-stage-tint]').length;`;
        const step = (type: string, f: number) =>
          s.evalJson<number>(FLICK.split('STEP').join(String(f)).split('TYPE').join(JSON.stringify(type)));
        await step('touchstart', 0);
        await sleep(30);
        let washed = 0;
        for (const f of [1 / 3, 2 / 3, 1]) {
          washed = await step('touchmove', f);
          await sleep(30);
        }
        await sleep(120);
        const midCard = await readCard(s, CARD);
        const washedMid = await s.evalJson<number>(`return document.querySelectorAll('[data-stage-tint]').length;`);
        await s.screenshot(ctx.shot('league-change-flick-mid'));
        await step('touchend', 1);
        await sleep(400);
        const after = await readCard(s, CARD);
        const washedAfter = await s.evalJson<number>(`return document.querySelectorAll('[data-stage-tint]').length;`);
        checks.push(ok('league-change:flick-moves-stage', after.lines[0]?.boundaries[2] === top - 2, `boundaries ${before.lines[0]?.boundaries} -> ${after.lines[0]?.boundaries} (mid ${midCard.lines[0]?.boundaries})`));
        checks.push(ok('league-change:flick-washes-the-stage', washedMid > 0 && washedAfter === 0, `washed cells mid-flick ${washedMid} (last move ${washed}), after release ${washedAfter}`));
      }
    }
  } else {
    checks.push({ name: 'league-change:charizard-seated', status: 'skip', detail: 'card never opened' });
  }

  const errs = await s.errors();
  checks.push(ok('league-change:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));
  return checks;
}

/** Cells in a seat column wearing the gym hover gradient wash. */
async function columnWashCount(s: Session, seat: number): Promise<number> {
  return s.evalJson<number>(`const cells=[...document.querySelectorAll('[data-testid^="card-cell-"][data-testid$="-${seat}"]')];
    return cells.filter((c)=>getComputedStyle(c).background.includes('linear-gradient')).length;`).catch(() => 0);
}

/** Close the league browser sheet the way the overlays spec does. */
async function dismissLeagueBrowser(s: Session): Promise<boolean> {
  const closed = await s.evalJson<boolean>(`const desktop=window.matchMedia('(min-width: 1024px)').matches;
    if(desktop){
      const h=[...document.querySelectorAll('h2')].find((x)=>(x.textContent||'').includes('Adding to'));
      const b=h?.parentElement?.querySelector('button[type="button"]');
      if(!b) return false;
      b.click();
      return true;
    }
    const back=[...document.querySelectorAll('div')].find((d)=>typeof d.className==='string'&&d.className.includes('bg-black/50'));
    if(!back) return false;
    back.click();
    return true;`).catch(() => false);
  await sleep(400);
  return closed;
}

/** Move a fine pointer over a column so the grid records hoverSeat. */
async function pointerOverColumn(s: Session, testId: string): Promise<void> {
  await s.hover(`[data-testid="${testId}"]`);
}

/**
 * PR #31: column hover must not stick on touch after the browser closes; desktop
 * pointer hover still washes the column. Structural reads only (computed style).
 */
export async function runLeagueColumnHoverSuite(s: Session, persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'league-hover:drive', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${BLANK_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await openLeagueCard(s, 0))) {
    checks.push({ name: 'league-hover:drive', status: 'skip', detail: 'card never opened' });
    return checks;
  }

  await s.click('[data-testid="card-cell-1-1"]');
  await sleep(600);
  const dismissed = await dismissLeagueBrowser(s);
  checks.push(ok('league-hover:browser-dismissed', dismissed, dismissed ? 'backdrop click' : 'no backdrop found'));
  const sticky = await columnWashCount(s, 1);
  await s.screenshot(ctx.shot('league-hover-after-browser-close'));

  if (persona !== null) {
    checks.push(ok('league-hover:mobile-no-sticky-wash', sticky === 0, `washed cells in seat 1: ${sticky}`));
    return checks;
  }

  checks.push(ok('league-hover:mobile-no-sticky-wash', sticky === 0, `washed cells in seat 1 after dismiss: ${sticky}`));
  await pointerOverColumn(s, 'card-cell-5-2');
  const washed = await columnWashCount(s, 2);
  checks.push(ok('league-hover:desktop-column-wash', washed >= 8, `washed cells in seat 2: ${washed}`));
  await s.screenshot(ctx.shot('league-hover-desktop-column'));
  return checks;
}

// PR #32: occupied home rows playlist-displace; empty rows fill only.
const E4_ONLY_LEAGUE =
  "JSON.stringify({state:{name:'Verify',cards:(()=>{const e=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null,powerups:{},signatureId:null,partnerId:null,legends:[]});const c=Array.from({length:14},e);const m=(t,b)=>({...e(),type:t,badgeName:b,lines:[{branch:[25],boundaries:[1]}]});c[8]=m('electric','E4-1');c[9]=m('fire','E4-2');c[10]=m('grass','E4-3');c[11]=m('psychic','E4-4');return c;})()},version:1})";

const SWAP_LEAGUE =
  "JSON.stringify({state:{name:'SwapProof',cards:(()=>{const e=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null,powerups:{},signatureId:null,partnerId:null,legends:[]});const n=['A','B','C','D','E','F','','G','H','','I','J','K','L'];const t=['electric','fire','water','grass','ghost','psychic',null,'ground','ice',null,'poison','dark','dragon','steel'];const m=[25,6,9,3,94,65,null,76,131,null,89,197,149,208];return n.map((b,i)=>b?{...e(),type:t[i],badgeName:b,lines:[{branch:[m[i]],boundaries:[1]}]}:e());})()},version:1})";

async function readSlotBadges(s: Session, indices?: number[]): Promise<string[]> {
  return s.evalJson(`const d=JSON.parse(localStorage.getItem(${JSON.stringify(LEAGUE_KEY)})||'{}');
    const cards=d.state?.cards||[];
    const idx=${indices ? JSON.stringify(indices) : 'null'};
    return (idx||cards.map((_,i)=>i)).map((i)=>cards[i]?.badgeName??'');`);
}

async function seedLeagueHome(s: Session, url: string, rawExpr: string): Promise<boolean> {
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) return false;
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${rawExpr}); return true;`);
  await s.navigate(url);
  return waitLeagueHome(s);
}

export async function runLeagueHomeSlotMoveProof(s: Session, persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  if (persona) return checks;
  const url = ctx.base + LEAGUE_PATH;

  if (!(await seedLeagueHome(s, url, E4_ONLY_LEAGUE))) {
    checks.push({ name: 'league-home:e4-to-gym8-preserves-e4', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }
  await s.dragPointer('[data-testid="league-slot-11"]', '[data-testid="league-slot-7"]');
  await sleep(500);
  await s.screenshot(ctx.shot('league-e4-to-gym8-after-drop'));
  const e4 = await readSlotBadges(s, [8, 9, 10, 7, 11]);
  checks.push(ok(
    'league-home:e4-to-gym8-preserves-e4',
    e4[0] === 'E4-1' && e4[1] === 'E4-2' && e4[2] === 'E4-3' && e4[3] === 'E4-4' && e4[4] === '',
    `badges at 8–10: ${e4.slice(0, 3).join(', ')}; slot 7=${e4[3]} slot 11=${e4[4]}`,
  ));

  const swapCases: { name: string; from: number; to: number; expect: string[] }[] = [
    { name: 'league-home:empty-fill-only', from: 5, to: 6, expect: ['A', 'B', 'C', 'D', 'E', '', 'F', 'G', 'H', '', 'I', 'J', 'K', 'L'] },
    { name: 'league-home:adjacent-down-displace', from: 4, to: 5, expect: ['A', 'B', 'C', 'D', 'F', 'E', '', 'G', 'H', '', 'I', 'J', 'K', 'L'] },
    { name: 'league-home:adjacent-up-displace', from: 5, to: 4, expect: ['A', 'B', 'C', 'D', 'F', 'E', '', 'G', 'H', '', 'I', 'J', 'K', 'L'] },
    { name: 'league-home:distant-playlist', from: 0, to: 5, expect: ['B', 'C', 'D', 'E', 'F', 'A', '', 'G', 'H', '', 'I', 'J', 'K', 'L'] },
    { name: 'league-home:last-row-playlist', from: 0, to: 13, expect: ['B', 'C', 'D', 'E', 'F', '', 'G', 'H', '', 'I', 'J', 'K', 'L', 'A'] },
    { name: 'league-home:drop-on-self', from: 0, to: 0, expect: ['A', 'B', 'C', 'D', 'E', 'F', '', 'G', 'H', '', 'I', 'J', 'K', 'L'] },
    { name: 'league-home:across-section-displace', from: 7, to: 8, expect: ['A', 'B', 'C', 'D', 'E', 'F', '', 'H', 'G', '', 'I', 'J', 'K', 'L'] },
  ];
  for (const c of swapCases) {
    if (!(await seedLeagueHome(s, url, SWAP_LEAGUE))) {
      checks.push({ name: c.name, status: 'skip', detail: 'league home never hydrated after seed' });
      continue;
    }
    await s.dragPointer(`[data-testid="league-slot-${c.from}"]`, `[data-testid="league-slot-${c.to}"]`);
    await sleep(400);
    await s.screenshot(ctx.shot(`league-${c.name.replace('league-home:', '')}`));
    const got = await readSlotBadges(s);
    checks.push(ok(c.name, got.join('|') === c.expect.join('|'), `got ${got.join(',')}`));
  }
  return checks;
}

export async function runFoilWorkshopSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  await s.navigate(ctx.base + '/foil-workshop');
  let loaded = false;
  for (let i = 0; i < 40; i++) {
    loaded = await s.evalJson<boolean>(`return !!document.querySelector('[data-foil-workshop]');`).catch(() => false);
    if (loaded) break;
    await sleep(250);
  }
  checks.push(ok('foil-workshop:loads', loaded, loaded ? 'workshop root' : 'missing [data-foil-workshop]'));
  if (!loaded) return checks;

  let imgReady = false;
  for (let i = 0; i < 80; i++) {
    imgReady = await s.evalJson<boolean>(`const img=document.querySelector('[data-export-tilt-hit] img'); return !!(img && img instanceof HTMLImageElement && img.naturalWidth>0);`).catch(() => false);
    if (imgReady) break;
    await sleep(250);
  }
  checks.push(ok('foil-workshop:preview-img', imgReady, imgReady ? 'preview painted' : 'no preview img'));
  const tiltVars = await s.evalJson<{ rot: string; holo: string; glare: string; blend: string }>(
    `const el=document.querySelector('[data-export-preview]');
     if(!(el instanceof HTMLElement)) return {rot:'',holo:'',glare:'',blend:''};
     const s=getComputedStyle(el);
     return {
       rot: s.getPropertyValue('--hover-tilt-rotation-x').trim(),
       holo: s.getPropertyValue('--foil-holographic').trim(),
       glare: s.getPropertyValue('--hover-tilt-glare-intensity').trim(),
       blend: s.getPropertyValue('--foil-holo-blend').trim(),
     };`,
  ).catch(() => ({ rot: '', holo: '', glare: '', blend: '' }));
  checks.push(ok('foil-workshop:hover-tilt-rotation', /^10(\.0+)?deg$/.test(tiltVars.rot), `rot=${tiltVars.rot}`));
  checks.push(ok('foil-workshop:prod-holo', Math.abs(Number(tiltVars.holo) - 0.25) < 0.02, `holo=${tiltVars.holo}`));
  checks.push(ok('foil-workshop:prod-glare', Math.abs(Number(tiltVars.glare) - 0.6) < 0.02, `glare=${tiltVars.glare}`));
  checks.push(ok('foil-workshop:prod-blend', tiltVars.blend === 'hue' || tiltVars.blend === '', `blend=${tiltVars.blend}`));
  await s.screenshot(ctx.shot('foil-workshop'));

  const controls = await s.evalJson<{
    holo: boolean;
    glare: boolean;
    shadow: boolean;
    holoBlend: boolean;
    glareBlend: boolean;
    extras: string[];
  }>(
    `const has=(sel)=>!!document.querySelector(sel);
     const extras=[...document.querySelectorAll('[data-foil-slider],[data-hover-tilt-mask],[data-workshop-dark-card-toggle]')]
       .map((el)=>el.getAttribute('data-foil-slider')||el.getAttribute('data-hover-tilt-mask')||el.getAttribute('data-workshop-dark-card-toggle')||el.tagName)
       .filter((id)=>!['holographic','glareIntensity','shadowBlur'].includes(id));
     return {
       holo: has('[data-foil-slider="holographic"]'),
       glare: has('[data-foil-slider="glareIntensity"]'),
       shadow: has('[data-workshop-shadow-toggle]') && has('[data-foil-slider="shadowBlur"]'),
       holoBlend: has('[data-hover-tilt-select="holoBlend"]'),
       glareBlend: has('[data-hover-tilt-select="blendMode"]'),
       extras,
     };`,
  ).catch(() => ({ holo: false, glare: false, shadow: false, holoBlend: false, glareBlend: false, extras: ['eval'] }));
  checks.push(ok('foil-workshop:keepers', controls.holo && controls.glare && controls.shadow && controls.holoBlend && controls.glareBlend, JSON.stringify(controls)));
  checks.push(ok('foil-workshop:no-extras', controls.extras.length === 0, `extras=${controls.extras.join(',')}`));

  await s.evalJson(
    `const input=document.querySelector('[data-foil-slider="glareIntensity"]');
     if(!(input instanceof HTMLInputElement)) return false;
     const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
     setter?.call(input,'0.91');
     input.dispatchEvent(new Event('input',{bubbles:true}));
     input.dispatchEvent(new Event('change',{bubbles:true}));
     return true;`,
  ).catch(() => false);
  await sleep(250);
  const intensity = await s.evalJson<string>(
    `const el=document.querySelector('[data-export-preview]');
     if(!(el instanceof HTMLElement)) return '';
     return getComputedStyle(el).getPropertyValue('--hover-tilt-glare-intensity').trim();`,
  ).catch(() => '');
  checks.push(ok('foil-workshop:glare-intensity', intensity === '0.910', `intensity=${intensity}`));

  await s.evalJson(
    `const sel=document.querySelector('[data-hover-tilt-select="holoBlend"]');
     if(!(sel instanceof HTMLSelectElement)) return false;
     sel.value='soft-light';
     sel.dispatchEvent(new Event('change',{bubbles:true}));
     return true;`,
  ).catch(() => false);
  await sleep(200);
  const blendAfter = await s.evalJson<string>(
    `const el=document.querySelector('[data-export-preview]');
     if(!(el instanceof HTMLElement)) return '';
     return getComputedStyle(el).getPropertyValue('--foil-holo-blend').trim();`,
  ).catch(() => '');
  checks.push(ok('foil-workshop:holo-blend', blendAfter === 'soft-light', `blend=${blendAfter}`));
  await s.evalJson(
    `const sel=document.querySelector('[data-hover-tilt-select="holoBlend"]');
     if(!(sel instanceof HTMLSelectElement)) return false;
     sel.value='hue';
     sel.dispatchEvent(new Event('change',{bubbles:true}));
     return true;`,
  ).catch(() => false);
  await s.screenshot(ctx.shot('foil-workshop-glare-intensity'));

  const overlay = await s.evalJson<{ pageBg: string; blur: string; scrimBg: string }>(
    `const page=document.querySelector('[data-workshop-stage-page]');
     const scrim=document.querySelector('[data-workshop-overlay]');
     if(!(page instanceof HTMLElement) || !(scrim instanceof HTMLElement)) return {pageBg:'',blur:'',scrimBg:''};
     const ps=getComputedStyle(page);
     const ss=getComputedStyle(scrim);
     return {
       pageBg: ps.backgroundColor,
       blur: ss.backdropFilter || ss.getPropertyValue('-webkit-backdrop-filter'),
       scrimBg: ss.backgroundColor,
     };`,
  ).catch(() => ({ pageBg: '', blur: '', scrimBg: '' }));
  const overlayOk =
    overlay.pageBg !== 'rgb(0, 0, 0)' &&
    overlay.pageBg.length > 0 &&
    /blur\(/.test(overlay.blur) &&
    overlay.scrimBg !== 'rgb(0, 0, 0)' &&
    /0\.5/.test(overlay.scrimBg);
  checks.push(ok('foil-workshop:overlay-scrim', overlayOk, `page=${overlay.pageBg} blur=${overlay.blur} scrim=${overlay.scrimBg}`));
  return checks;
}

/** League and gym live overlays must share Dex foil: ink-only rainbow, hypot, shadow. */
export async function runLeagueGymExportFoilSuite(
  s: Session,
  _persona: PersonaName | null,
  ctx: FlowContext,
): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;
  if (!(await seedLeagueHome(s, url, SWAP_LEAGUE))) {
    checks.push({ name: 'league-export:rainbow-foil', status: 'skip', detail: 'league home never hydrated' });
    checks.push({ name: 'gym-export:rainbow-foil', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }
  const viewW = await s.evalJson<number>(`return innerWidth`).catch(() => 1280);
  const desktop = viewW >= 1024;
  const hypotOk = (h: number) => (desktop ? h > 2.4 && h <= 3.8 : h > 2.4 && h <= 4.6);

  const openLeague = await s.evalJson<boolean>(
    `const b=document.querySelector('[data-league-export]');
     if(!(b instanceof HTMLElement)) return false;
     b.click();
     return true;`,
  ).catch(() => false);
  if (!openLeague) {
    checks.push(ok('league-export:rainbow-foil', false, 'missing [data-league-export]'));
  } else {
    await sleep(500);
    const league = await measureSharedExportFoil(s);
    await s.screenshot(ctx.shot('league-export-foil'));
    checks.push(ok(
      'league-export:rainbow-foil',
      league.img && league.maps && league.rainbow.ok && hypotOk(league.hypot),
      `${league.rainbow.reason} hypot=${league.hypot.toFixed(1)} orbit=${league.orbit} maps=${league.maps}`,
    ));
    await closeExportOverlay(s);
  }

  const openedGym = await s.evalJson<boolean>(
    `const slot=document.querySelector('[data-testid="league-slot-0"]');
     if(!(slot instanceof HTMLElement)) return false;
     slot.click();
     return true;`,
  ).catch(() => false);
  if (!openedGym) {
    checks.push(ok('gym-export:rainbow-foil', false, 'missing league-slot-0'));
    return checks;
  }
  await sleep(400);
  const gymBtn = await waitFor(s, '[aria-label="Export trainer card"]', 30);
  if (!gymBtn) {
    checks.push(ok('gym-export:rainbow-foil', false, 'missing Export trainer card'));
    return checks;
  }
  await s.evalJson(
    `const b=document.querySelector('[aria-label="Export trainer card"]');
     if(b instanceof HTMLElement) b.click();
     return true;`,
  ).catch(() => false);
  await sleep(500);
  const gym = await measureSharedExportFoil(s);
  await s.screenshot(ctx.shot('gym-export-foil'));
  checks.push(ok(
    'gym-export:rainbow-foil',
    gym.img && gym.maps && gym.rainbow.ok && hypotOk(gym.hypot),
    `${gym.rainbow.reason} hypot=${gym.hypot.toFixed(1)} orbit=${gym.orbit} maps=${gym.maps}`,
  ));
  await closeExportOverlay(s);
  return checks;
}
