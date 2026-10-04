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
    // `locale` pins English, so each engine's own navigator.languages cannot
    // change a label the flows read.
    state: { sections, milestoneMax: count, milestoneCelebrated: [25].filter((m) => m <= count), localeNoticeSeen: true, locale: 'en' },
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

// Which view is active. Prefer aria-selected (tab set). Fall back to a
// non-transparent fill so a ghost-vs-default chrome still reads. The fill
// serializes as rgb(), rgba(), or oklab() depending on the engine, so test
// for "not transparent" rather than parse a color format.
const ACTIVE_VIEW = `
const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent', '']);
const btns = [...document.querySelectorAll('[data-nav]')];
const selected = btns.filter(b => b.getAttribute('aria-selected') === 'true').map(b => b.getAttribute('data-nav'));
const filled = btns.filter(b => !TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim())).map(b => b.getAttribute('data-nav'));
const active = selected.length ? selected : filled;
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
// instantly adds the line (PokemonBrowser.tsx handleToggleStage). Runs on
// desktop-width Blink, where the instant-add path applies; a phone stages the pick
// and commits it from a floating button instead.
const PLACE_CARD = '[data-testid="verify-evo-card"]';
// The section's own "+" by structure. Its aria-label is translated, so a label
// match skips under any locale but English.
const MEADOW_ADD = '[data-section-id="meadow"] [data-add-slot]';

async function driveRealPlacement(s: Session): Promise<Check> {
  const name = 'placement:real-add-grows-store';
  const addBtn = await s.evalJson<boolean>(`return !!document.querySelector(${JSON.stringify(MEADOW_ADD)});`).catch(() => false);
  if (!addBtn) return ok(name, false, `${MEADOW_ADD} not found`);
  const before = await totalPlaced(s);
  await s.click(MEADOW_ADD);
  await sleep(800);
  // The browser renders its cards only once opened, so check the handle now.
  const cardPresent = await s.evalJson<boolean>(`return !!document.querySelector(${JSON.stringify(PLACE_CARD)});`).catch(() => false);
  if (!cardPresent) return ok(name, false, `${PLACE_CARD} not rendered after opening the browser`);
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
       const list=document.querySelector('[role="tablist"]');
       const navs=[...document.querySelectorAll('[data-nav]')];
       if(!title||!actions||navs.length===0) return {ok:false,found:false,detail:'handles missing'};
       const navBox=list?list.getBoundingClientRect():null;
       const navLeft=navBox?navBox.left:Math.min(...navs.map(b=>b.getBoundingClientRect().left));
       const navRight=navBox?navBox.right:Math.max(...navs.map(b=>b.getBoundingClientRect().right));
       const inner=title.firstElementChild;
       const titleRight=inner?inner.getBoundingClientRect().right:title.getBoundingClientRect().left;
       const kids=[...actions.children].map(k=>k.getBoundingClientRect().left);
       const actionsLeft=kids.length?Math.min(...kids):actions.getBoundingClientRect().right;
       const ok=titleRight<=navLeft+0.5&&navRight<=actionsLeft+0.5;
       return {ok,found:true,detail:'title.r='+Math.round(titleRight)+' nav=['+Math.round(navLeft)+','+Math.round(navRight)+'] actions.l='+Math.round(actionsLeft)};`,
    );
    checks.push(ok(`header:${nav}-no-overlap`, lanes.found && lanes.ok, lanes.detail));
    const tabset = await s.evalJson<{ ok: boolean; detail: string }>(
      `const TRANSPARENT=new Set(['rgba(0, 0, 0, 0)','transparent','']);
       const navs=[...document.querySelectorAll('[data-nav]')];
       const list=document.querySelector('[role="tablist"]');
       const primary=getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
       const parse=(css)=>{const rgb=css.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);if(rgb)return[Number(rgb[1]),Number(rgb[2]),Number(rgb[3])];return null;};
       const hex=primary.startsWith('#')?(primary.length===4?primary.slice(1).split('').map(c=>c+c).join(''):primary.slice(1)):null;
       const primaryRgb=hex?[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]:parse(primary);
       const selected=navs.filter(b=>b.getAttribute('aria-selected')==='true');
       const active=selected[0]||navs[0];
       const activeBg=active?getComputedStyle(active).backgroundColor.trim():'';
       const activeRgb=parse(activeBg);
       const othersGhost=navs.filter(b=>b!==active).every(b=>TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim()));
       const lone=othersGhost&&activeRgb&&primaryRgb&&activeRgb.every((v,i)=>Math.abs(v-primaryRgb[i])<=2);
       const inList=!!list&&navs.every(n=>list.contains(n));
       const track=!!list&&!TRANSPARENT.has(getComputedStyle(list).backgroundColor.trim());
       const roles=navs.every(b=>b.getAttribute('role')==='tab');
       const ok=inList&&track&&roles&&selected.length===1&&!lone;
       return {ok,detail:'inList='+inList+' track='+track+' roles='+roles+' selected='+selected.length+' lone='+lone};`,
    );
    checks.push(ok(`nav:${nav}-tabset`, tabset.ok, tabset.detail));
    const fourDigit = await s.evalJson<{ ok: boolean; found: boolean; detail: string }>(
      `const n=document.querySelector('[data-testid="tool-title"] .text-primary');
       if(!n) return {ok:false,found:false,detail:'count missing'};
       const prev=n.textContent;
       n.textContent='1025';
       const title=document.querySelector('[data-testid="tool-title"]');
       const actions=document.querySelector('[data-testid="tool-actions"]');
       const list=document.querySelector('[role="tablist"]');
       const navs=[...document.querySelectorAll('[data-nav]')];
       const navBox=list?list.getBoundingClientRect():null;
       const navLeft=navBox?navBox.left:Math.min(...navs.map(b=>b.getBoundingClientRect().left));
       const navRight=navBox?navBox.right:Math.max(...navs.map(b=>b.getBoundingClientRect().right));
       const inner=title.firstElementChild;
       const titleRight=inner?inner.getBoundingClientRect().right:title.getBoundingClientRect().left;
       const kids=[...actions.children].map(k=>k.getBoundingClientRect().left);
       const actionsLeft=kids.length?Math.min(...kids):actions.getBoundingClientRect().right;
       const ok=titleRight<=navLeft+0.5&&navRight<=actionsLeft+0.5;
       n.textContent=prev;
       return {ok,found:true,detail:'4digit title.r='+Math.round(titleRight)+' nav=['+Math.round(navLeft)+','+Math.round(navRight)+'] actions.l='+Math.round(actionsLeft)};`,
    );
    checks.push(ok(`header:${nav}-4digit-no-overlap`, fourDigit.found && fourDigit.ok, fourDigit.detail));
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
     if(mix!=='color-dodge') return {ok:false,reason:'blend '+mix};
     if(!(opacity>0.04)) return {ok:false,reason:'opacity '+opacity.toFixed(3)};
     if(Math.abs(amount-0.7)>0.02) return {ok:false,reason:'amount '+amount};
     if(!(foil>0.2)) return {ok:false,reason:'foil '+foil.toFixed(3)};
     if(!mask.includes('url(')) return {ok:false,reason:'unmasked '+mask.slice(0,40)};
     if(mask.includes('image/svg')) return {ok:false,reason:'frame mask hides ink'};
     if(!mask.includes('image/png')) return {ok:false,reason:'ink mask missing'};
     // The poke-holo V shine: diagonal bands over a sunpillar rainbow, and a
     // second copy whose bands travel the other way.
     if(!cs.backgroundImage.includes('repeating-linear-gradient')) return {ok:false,reason:'no V bands'};
     const after=getComputedStyle(holo,'::after');
     if(after.mixBlendMode!=='soft-light'||!after.backgroundImage.includes('repeating-linear-gradient')) return {ok:false,reason:'no crossing layer'};
     if(holo.offsetWidth<80 || holo.offsetHeight<80) return {ok:false,reason:'size '+holo.offsetWidth+'x'+holo.offsetHeight};
     const lift=document.querySelector('[data-export-foil-lift]');
     const liftStyle=lift instanceof HTMLElement ? getComputedStyle(lift) : null;
     const shadow=liftStyle?.boxShadow||'';
     if(!shadow || shadow==='none') return {ok:false,reason:'no lift shadow'};
     const hitStyle=hit instanceof HTMLElement ? getComputedStyle(hit) : null;
     if(hitStyle && hitStyle.boxShadow!=='none' && hitStyle.boxShadow!=='') return {ok:false,reason:'hit still shadowed'};
     if(hitStyle && parseFloat(hitStyle.paddingTop||'0')<32) return {ok:false,reason:'hit pad '+hitStyle.paddingTop};
     return {ok:true,reason:'v-shine '+opacity.toFixed(2)+' foil='+foil.toFixed(2)};`,
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

async function measureSharedExportFoil(s: Session, hypotOk: (h: number) => boolean): Promise<{
  img: boolean;
  maps: boolean;
  rainbow: { ok: boolean; reason: string };
  hypot: number;
  orbit: string;
  waited: number;
}> {
  const img = await waitForDexPreviewImg(s);
  const maps = await waitForFoilMaps(s);
  await pokeExportCorner(s);
  // Poll like rainbow-on-open: WebKitGTK paints the V shine near 7 fps here.
  const started = Date.now();
  let rainbow: { ok: boolean; reason: string };
  let pose: { hypot: number; orbit: string };
  for (;;) {
    rainbow = await readInkOnlyRainbow(s);
    pose = await s.evalJson<{ hypot: number; orbit: string }>(
      `const card=document.querySelector('[data-export-preview]');
       const x=Number(card?.getAttribute('data-tilt-x')||0);
       const y=Number(card?.getAttribute('data-tilt-y')||0);
       return {hypot:Math.hypot(x,y),orbit:card?.getAttribute('data-export-orbit')||''};`,
    ).catch(() => ({ hypot: 0, orbit: '' }));
    if ((rainbow.ok && hypotOk(pose.hypot)) || Date.now() - started >= 3000) break;
    await sleep(100);
  }
  return { img, maps, rainbow, hypot: pose.hypot, orbit: pose.orbit, waited: Date.now() - started };
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
  liftTransform: string;
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
     const lift=document.querySelector('[data-export-foil-lift]');
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
       perspective: hitStyle?.getPropertyValue('--export-perspective').trim() || '',
       liftTransform: lift instanceof HTMLElement ? getComputedStyle(lift).transform : '',
     };`,
  ).catch(() => ({
    x: 0, y: 0, hypot: 0, foil: 0, orbit: '', paused: '', scale: '', light: 0, holo: 0, maps: '',
    top: 0, left: 0, width: 0, height: 0, perspective: '', liftTransform: '',
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
  // The foil paints on the next animation frame after the maps land. WebKitGTK
  // under Xvfb runs near 7 fps here, so allow a few frames, and report the wait.
  const rainbowStart = Date.now();
  let rainbowOnOpen = await readInkOnlyRainbow(s);
  while (!rainbowOnOpen.ok && Date.now() - rainbowStart < 1500) {
    await sleep(100);
    rainbowOnOpen = await readInkOnlyRainbow(s);
  }
  rainbowOnOpen = { ...rainbowOnOpen, reason: `${rainbowOnOpen.reason} after ${Date.now() - rainbowStart}ms` };
  // Do not move the Playwright mouse. Sit a stationary cursor on the card,
  // the way a person often has it, then require the painted box to change.
  await sitCursorOnDexPreview(s);
  const idleWait = Date.now();
  let idleA = await readDexPreviewMotion(s);
  while (Date.now() - idleWait < 8000 && idleA.hypot <= 1.25) {
    await sleep(200);
    idleA = await readDexPreviewMotion(s);
  }
  await sleep(2500);
  const idleB = await readDexPreviewMotion(s);
  const idleDelta = Math.hypot(idleB.x - idleA.x, idleB.y - idleA.y);
  const visualDelta = visualTiltDelta(idleA, idleB);
  // The lift projects itself: perspective() is inside its own transform.
  const perspectiveOn = idleA.perspective.startsWith('600') && idleB.liftTransform.startsWith('matrix3d');
  const idleMoved =
    idleA.orbit === 'idle' &&
    idleB.orbit === 'idle' &&
    Math.max(idleA.hypot, idleB.hypot) > 1.25 &&
    perspectiveOn &&
    (idleDelta > 1 || visualDelta > 2 || Math.min(idleA.hypot, idleB.hypot) > 2);
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
  const hoverScaleN = Number(hoverScale);
  const hoverCircle = {
    ok: hoverScaleN >= 1.08 && hoverScaleN <= 1.16 && widthDelta < 2 && hoverMax > 2 && hoverOrbit === 'pointer' && hoverMax <= 10.2,
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
     // The layer's 8px padding plus PREVIEW_REST_PAD (8), which the fit keeps
     // around the card at max tilt. At the 10deg default a phone reads 17.5.
     return {ok:min>=16,reason:'gap '+min.toFixed(1)};`,
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
     return {ok:true,reason:'probe='+probe.x.toFixed(0)+','+probe.y.toFixed(0)};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  // The pose lands on later frames, so poll instead of reading the frame the
  // move arrived on.
  if (paintedHit.ok) {
    const probeAt = paintedHit.reason;
    const started = Date.now();
    let pose = { orbit: '', hypot: 0 };
    do {
      await sleep(60);
      pose = await s.evalJson<{ orbit: string; hypot: number }>(
        `const card=document.querySelector('[data-export-preview]');
         return {orbit:card?.getAttribute('data-export-orbit')||'',hypot:Math.hypot(Number(card?.dataset.tiltX||0),Number(card?.dataset.tiltY||0))};`,
      ).catch(() => ({ orbit: '', hypot: 0 }));
    } while (!(pose.orbit === 'pointer' && pose.hypot > 1) && Date.now() - started < 800);
    paintedHit.ok = pose.orbit === 'pointer' && pose.hypot > 1;
    paintedHit.reason = `${pose.orbit} hypot=${pose.hypot.toFixed(1)} ${probeAt} after ${Date.now() - started}ms`;
  }
  const restStatic = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     if(!(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,clientX:12,clientY:12,pointerType:'mouse',pointerId:1}));
     return {ok:true,reason:card.getAttribute('data-export-orbit')||''};`,
  ).catch(() => ({ ok: false, reason: 'eval' }));
  await sleep(350);
  // Leaving after a hover rests the card flat, and auto-tilt does not return.
  const restHold = await readDexPreviewMotion(s);
  let restAfter = restHold;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    restAfter = await readDexPreviewMotion(s);
    if (restAfter.orbit === 'static') break;
  }
  await sleep(1500);
  const restLater = await readDexPreviewMotion(s);
  const restOk =
    restHold.orbit !== 'pointer' &&
    restAfter.orbit === 'static' &&
    restLater.orbit === 'static' &&
    restLater.hypot < 0.2;
  await s.screenshot(ctx.shot('dex-export-hover'));
  await s.evalJson(
    `(() => {
       const hit=document.querySelector('[data-export-tilt-hit]');
       if(!(hit instanceof HTMLElement)) return false;
       const r=hit.getBoundingClientRect();
       const x=r.left+r.width/2, y=r.top+r.height/2;
       const base={bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',buttons:1};
       hit.dispatchEvent(new PointerEvent('pointerdown',{...base,clientX:x,clientY:y}));
       document.dispatchEvent(new PointerEvent('pointermove',{...base,clientX:x+48,clientY:y-32}));
       hit.dispatchEvent(new PointerEvent('pointerup',{...base,clientX:x+48,clientY:y-32,buttons:0}));
       return true;
     })()`,
  ).catch(() => false);
  await sleep(700);
  const locked = await readDexPreviewMotion(s);
  const fill = await s.evalJson<{ ok: boolean; reason: string; ratio: number }>(
    `const card=document.querySelector('[data-export-preview]');
     const layer=document.querySelector('[data-export-preview-layer]');
     if(!(card instanceof HTMLElement) || !(layer instanceof HTMLElement)) return {ok:false,reason:'missing',ratio:0};
     const c=card.getBoundingClientRect(); const l=layer.getBoundingClientRect();
     const ratio=Math.max(c.width/Math.max(1,l.width), c.height/Math.max(1,l.height));
     if(c.left<l.left-4||c.right>l.right+4||c.top<l.top-4||c.bottom>l.bottom+4) return {ok:false,reason:'overflow',ratio};
     return {ok:ratio>=0.70,reason:'cover '+ratio.toFixed(3),ratio};`,
  ).catch(() => ({ ok: false, reason: 'eval', ratio: 0 }));
  const corners = await s.evalJson<{ ok: boolean; reason: string }>(
    `const card=document.querySelector('[data-export-preview]');
     if(!(card instanceof HTMLElement)) return {ok:false,reason:'missing'};
     const style=getComputedStyle(card);
     const bg=style.backgroundColor.replace(/\\s+/g,'');
     const clip=style.getPropertyValue('clip-path')+' '+style.getPropertyValue('-webkit-clip-path');
     const transparent=bg==='transparent'||bg==='rgba(0,0,0,0)'||bg==='rgba(0,0,0,0.0)';
     if(!transparent) return {ok:false,reason:'corner fill '+bg};
     // The PNG carries its own rounded corners, and its alpha is the card's mask.
     // A separate rounded clip would disagree with the exported shape.
     if(/round/i.test(clip)) return {ok:false,reason:'independent clip '+clip};
     const img=card.querySelector('img');
     const shapeMask=(style.getPropertyValue('-webkit-mask-image')+' '+style.getPropertyValue('mask-image')).replace(/\\s+/g,' ');
     if(!(img instanceof HTMLImageElement) || !shapeMask.includes(img.currentSrc)) return {ok:false,reason:'shape mask '+shapeMask.slice(0,60)};
     if(card.className.includes('bg-white')) return {ok:false,reason:'bg-white'};
     return {ok:true,reason:bg+' png-shape-mask'};`,
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
     if(Math.abs(holoAmt-0.7)>0.02) return {ok:false,reason:'holo amount '+holoAmt};
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
    ok('dex-export:tilt-magnitude', hoverCircle.ok && hoverMax > 2 && hoverMax <= 10.2, `hypot=${hoverMax.toFixed(1)} w=${viewW}`),
    ok('dex-export:dynamic-shadow', shadowPair.ok, shadowPair.reason),
    ok('dex-export:tilt-corner-margin', cornerMargin.ok, cornerMargin.reason),
    ok('dex-export:tilt-on-painted', paintedHit.ok, paintedHit.reason),
    ok('dex-export:hover-leave-static', restOk, `hold=${restHold.orbit}/${restHold.hypot.toFixed(1)} after=${restAfter.orbit} later=${restLater.orbit}/${restLater.hypot.toFixed(1)} ${restStatic.reason}`),
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
/** How far the TM text's top and bottom gaps may differ, in px. The gaps come
 *  from text-box rects, so each engine's font metrics shift them: Blink differs
 *  by 0.3px on production, Gecko by 1.4px with the same layout. */
const TM_GAP_SLACK = 1.5;
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
    // Structural, not the shell's wording: the title was renamed once, a text
    // match turned this whole suite into a silent skip, and every run since
    // reported the league as passing without driving it. The league page is
    // its own build entry, so its canonical link names its own path.
    const hasH1 = /<h1[^>]*>[^<]{3,}<\/h1>/i.test(html);
    const hasTitle = /<title>[^<]{3,}<\/title>/i.test(html);
    const canonical = html.match(/<link rel="canonical"[^>]*>/i)?.[0] ?? '';
    const ownEntry = canonical.includes(LEAGUE_PATH);
    checks.push(
      ok(
        'league:static-seo-content',
        res.ok && hasH1 && hasTitle && ownEntry,
        `status ${res.status} h1=${hasH1} title=${hasTitle} canonical=${ownEntry}`,
      ),
    );
    if (!res.ok) return checks;
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
  if (hydrated) {
    await waitForImages(s);
    checks.push(await auditRender(s, 'league:render-no-clipped-content'));
  }

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
    await waitForImages(s);
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

/** Wait until every visible image has loaded, up to about 10s. The render
 *  audit reads boxes, and a sprite that is still loading has none, so an
 *  audit taken early saw a different page on each run: on Gecko 54 of 61
 *  league-home images were still loading at hydration in 2 of 3 runs. */
async function waitForImages(s: Session): Promise<number> {
  let pending = 0;
  for (let i = 0; i < 50; i++) {
    pending = await s
      .evalJson<number>(`return [...document.querySelectorAll('img')].filter(im=>im.getClientRects().length&&(!im.complete||!im.naturalWidth)).length;`)
      .catch(() => 0);
    if (pending === 0) return 0;
    await sleep(200);
  }
  return pending;
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

async function clickHandle(s: Session, selector: string): Promise<boolean> {
  if (!(await waitFor(s, selector))) return false;
  try {
    await s.click(selector);
    return true;
  } catch {
    return s
      .evalJson<boolean>(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return false; el.click(); return true;`)
      .catch(() => false);
  }
}

/** Open a card from the league home; the home must be showing. */
async function openLeagueCard(s: Session, card: number): Promise<boolean> {
  if (!(await clickHandle(s, `[data-testid="league-slot-${card}"]`))) return false;
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

  // Story / Rematch is the shared pill tab set, not a lone primary button.
  const tabset = await s.evalJson<{ ok: boolean; detail: string }>(
    `const TRANSPARENT=new Set(['rgba(0, 0, 0, 0)','transparent','']);
     const list=document.querySelector('[data-testid="league-nav"]');
     const tabs=[...document.querySelectorAll('[data-testid="league-nav"] [data-league-view]')];
     const primary=getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
     const parse=(css)=>{const rgb=css.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/);if(rgb)return[Number(rgb[1]),Number(rgb[2]),Number(rgb[3])];return null;};
     const hex=primary.startsWith('#')?(primary.length===4?primary.slice(1).split('').map(c=>c+c).join(''):primary.slice(1)):null;
     const primaryRgb=hex?[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)]:parse(primary);
     const selected=tabs.filter(b=>b.getAttribute('aria-selected')==='true');
     const active=selected[0]||tabs[0];
     const activeBg=active?getComputedStyle(active).backgroundColor.trim():'';
     const activeRgb=parse(activeBg);
     const othersGhost=tabs.filter(b=>b!==active).every(b=>TRANSPARENT.has(getComputedStyle(b).backgroundColor.trim()));
     const lone=othersGhost&&activeRgb&&primaryRgb&&activeRgb.every((v,i)=>Math.abs(v-primaryRgb[i])<=2);
     const inList=!!list&&tabs.every(n=>list.contains(n));
     const track=!!list&&!TRANSPARENT.has(getComputedStyle(list).backgroundColor.trim());
     const roles=tabs.every(b=>b.getAttribute('role')==='tab');
     const ok=tabs.length===2&&inList&&track&&roles&&selected.length===1&&!lone;
     return {ok,detail:'tabs='+tabs.length+' inList='+inList+' track='+track+' roles='+roles+' selected='+selected.length+' lone='+lone};`,
  );
  checks.push(ok('league:story-rematch-tabset', tabset.ok, tabset.detail));
  await s.screenshot(ctx.shot('league-story-rematch-tabs'));

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

    await s.evalJson(`const c=document.querySelector('[data-testid="card-cell-9-1"]'); if(c) c.scrollIntoView({block:'center'}); return true;`).catch(() => false);
    await sleep(s.engine === 'webkit' ? 400 : 200);
    const stars = await s.evalJson<{ n: number; ySpread: number; xSpread: number; increasing: boolean; zoom: number }>(
      `const root=document.querySelector('[data-lg-card-root]');
       const marks=[...(root?root.querySelectorAll('svg'):[])].filter(s=>(s.querySelector('path')?.getAttribute('d')||'').startsWith('M6 0.5'));
       const boxes=marks.map(s=>s.getBoundingClientRect());
       const ys=boxes.map(b=>b.y); const xs=boxes.map(b=>b.x);
       const ySpread=ys.length?Math.max(...ys)-Math.min(...ys):99;
       const xSpread=xs.length?Math.max(...xs)-Math.min(...xs):0;
       const increasing=xs.every((x,i)=>i===0||x>xs[i-1]+1);
       const zoom=Number(root?.parentElement?.style.zoom)||1;
       return {n:marks.length,ySpread,xSpread,increasing,zoom};`,
    ).catch(() => ({ n: 0, ySpread: 99, xSpread: 0, increasing: false, zoom: 1 }));
    // The stars are px-sized inside the zoomed card, so their spread scales
    // with the fit: 20px at zoom 1.
    checks.push(ok(
      'league:elite-stars-one-row',
      stars.n === 4 && stars.ySpread < 2 && stars.increasing && stars.xSpread > 20 * stars.zoom,
      JSON.stringify(stars),
    ));
    await s.screenshot(ctx.shot('league-elite-stars'));

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

  await s.navigate(url);
  if ((await waitLeagueHome(s)) && (await openLeagueCard(s, CARD))) {
    await s.click('[aria-label^="Gym type"]');
    await sleep(300);
    await s.click('svg[data-type="fire"]');
    await sleep(400);
    await s.click('[data-testid="slot-tm"]');
    const picker = await waitFor(s, '[data-testid="tm-chip-type-fire"]');
    const typed = await s
      .evalJson<{ ok: boolean; value: string }>(`const i=document.querySelector('[data-testid="tm-search"]');
        if(!i) return {ok:false,value:''};
        i.focus();
        const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        set.call(i,'surf');
        i.dispatchEvent(new Event('input',{bubbles:true}));
        i.dispatchEvent(new Event('change',{bubbles:true}));
        return {ok:true,value:i.value};`)
      .catch(() => ({ ok: false, value: '' }));
    await sleep(900);
    const hasSurf = await s
      .evalJson<boolean>(`return !!document.querySelector('[data-testid="tm-move-57"]');`)
      .catch(() => false);
    checks.push(ok(
      'league-change:tm-search-ignores-type-chip',
      picker && typed.ok && hasSurf,
      `picker=${picker} typed=${typed.ok} value=${typed.value} hasSurf=${hasSurf}`,
    ));
    await s.screenshot(ctx.shot('league-change-tm-search-surf'));
    await s.navigate(url);
    await waitLeagueHome(s);
  } else {
    checks.push({ name: 'league-change:tm-search-ignores-type-chip', status: 'skip', detail: 'card never opened' });
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
async function pointerOverColumn(s: Session, testId: string): Promise<boolean> {
  try {
    await s.hover(`[data-testid="${testId}"]`);
    return true;
  } catch {
    return false;
  }
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
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'league-hover:drive', status: 'skip', detail: 'league home never hydrated after seed' });
    return checks;
  }
  if (!(await openLeagueCard(s, 0))) {
    checks.push({ name: 'league-hover:drive', status: 'skip', detail: 'card never opened' });
    return checks;
  }

  if (!(await clickHandle(s, '[data-testid="card-cell-1-1"]'))) {
    checks.push({ name: 'league-hover:drive', status: 'skip', detail: 'empty cell never opened' });
    return checks;
  }
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
  // The wash is gated on a hover-capable fine pointer (CardGrid.tsx). Headless
  // Firefox reports neither, so there is nothing to wash on that engine and a
  // zero count says nothing about the app.
  const hoverPointer = await s
    .evalJson<boolean>(`return matchMedia('(hover: hover) and (pointer: fine)').matches;`)
    .catch(() => false);
  if (!hoverPointer) {
    checks.push({ name: 'league-hover:desktop-column-wash', status: 'skip', detail: 'engine reports no hover-capable fine pointer (headless); a desktop browser with a mouse is the proof' });
    return checks;
  }
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

const FAV_PATH = '/favorite-pokemon-by-type';
const FAV_KEY = 'favorite-picker';

async function waitGone(s: Session, selector: string, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const there = await s.evalJson<boolean>(`return !!document.querySelector(${JSON.stringify(selector)});`).catch(() => true);
    if (!there) return true;
    await sleep(200);
  }
  return false;
}

async function waitFavoritesGrid(s: Session): Promise<boolean> {
  return waitFor(s, '[data-testid="favorites-grid"]');
}

/**
 * Click a grid cell after scrolling it into the grid frame.
 *
 * The grid scrolls inside its own frame. WebKitGTK's WebDriver scrolls only
 * the page before a click, so a row below the frame reads as not
 * interactable there. A user scrolls the frame first, and so does this.
 */
async function clickCell(s: Session, selector: string): Promise<void> {
  await s.evalJson(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true;`);
  await s.click(selector);
}

async function pickFavorite(s: Session, cell: string, id: number): Promise<boolean> {
  await clickCell(s, `[data-testid="${cell}"]`);
  if (!(await waitFor(s, `[data-testid="favorites-pick-${id}"]`))) return false;
  await s.click(`[data-testid="favorites-pick-${id}"]`);
  await sleep(400);
  return true;
}

export async function runFavoritesSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + FAV_PATH;

  try {
    const res = await fetch(url);
    const html = await res.text();
    const hasH1 = /<h1[^>]*>[^<]*Favorite Pokémon Picker/i.test(html);
    const hasTitle = /<title>[^<]*Favorite Pokémon Picker/i.test(html);
    if (!res.ok) {
      checks.push(ok('favorites:static-seo-content', false, `status ${res.status}`));
      return checks;
    }
    if (!hasH1 || !hasTitle) {
      checks.push({
        name: 'favorites:static-seo-content',
        status: 'skip',
        detail: `favorite picker not in this build yet (SPA fallback at ${FAV_PATH})`,
      });
      return checks;
    }
    checks.push(ok('favorites:static-seo-content', true, `status ${res.status}`));
  } catch (e) {
    checks.push({ name: 'favorites:static-seo-content', status: 'fail', detail: (e as Error).message });
    return checks;
  }

  await s.navigate(ctx.base + '/');
  await waitForApp(s);
  const hub = await waitFor(s, 'a[href="/favorite-pokemon-by-type"]');
  checks.push(ok('favorites:hub-card', hub));
  await s.screenshot(ctx.shot('favorites-hub'));

  await s.evalJson(`try{localStorage.removeItem(${JSON.stringify(FAV_KEY)});}catch{} return true;`);
  await s.navigate(url);
  const hydrated = await waitFavoritesGrid(s);
  checks.push(ok('favorites:hydrated-grid', hydrated));
  await s.evalJson(`
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    const scroller = document.querySelector('[data-testid="favorites-grid-scroll"]');
    if (scroller) scroller.scrollLeft = 0;
    return true;
  `);
  await s.screenshot(ctx.shot('favorites-grid'));
  if (hydrated) {
    const balls = await s.evalJson<{ count: number; inside: number; centered: number }>(`
      const balls = [...document.querySelectorAll('[data-testid="favorites-empty-ball"]')];
      let inside = 0, centered = 0;
      for (const ball of balls) {
        const cell = ball.closest('button');
        const svg = ball.querySelector('svg');
        if (!cell || !svg) continue;
        const cb = cell.getBoundingClientRect();
        const bb = svg.getBoundingClientRect();
        const pad = 0.75;
        if (bb.width > 8 && bb.height > 8 && bb.left >= cb.left - pad && bb.right <= cb.right + pad && bb.top >= cb.top - pad && bb.bottom <= cb.bottom + pad) inside++;
        const dx = Math.abs((bb.left + bb.right) / 2 - (cb.left + cb.right) / 2);
        const dy = Math.abs((bb.top + bb.bottom) / 2 - (cb.top + cb.bottom) / 2);
        if (dx < 1.5 && dy < 1.5) centered++;
      }
      return { count: balls.length, inside, centered };
    `);
    checks.push(ok(
      'favorites:empty-ball-inside-cell',
      balls.count > 20 && balls.inside === balls.count && balls.centered === balls.count,
      `count=${balls.count} inside=${balls.inside} centered=${balls.centered}`,
    ));
    checks.push(await auditRender(s, 'favorites:render-grid'));
  }

  const layout = await s.evalJson<{ scrollWidth: number; innerWidth: number; bodyH: number }>(LAYOUT);
  checks.push(ok(
    'favorites:no-horizontal-overflow',
    layout.scrollWidth <= layout.innerWidth + 2,
    `scrollWidth ${layout.scrollWidth} vs innerWidth ${layout.innerWidth}`,
  ));

  if (!hydrated) {
    const errs = await s.errors();
    checks.push(ok('favorites:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));
    return checks;
  }

  await clickCell(s, '[data-testid="favorites-cell-electric-5"]');
  const pretty = await waitFor(s, '[data-testid="favorites-pretty-grid"]');
  checks.push(ok('favorites:picker-opens', pretty));
  await settle(s);
  if (pretty) {
    const row = await s.evalJson<{
      lastShorter: boolean;
      lastInset: boolean;
      justify: string;
      firstX: number;
      lastX: number;
      firstLen: number;
      lastLen: number;
    }>(`
      const rows = [...document.querySelectorAll('[data-pretty-row]')];
      if (rows.length < 2) return { lastShorter:false, lastInset:false, justify:'', firstX:0, lastX:0, firstLen:0, lastLen:0 };
      const first = rows[0], last = rows[rows.length-1];
      const firstBtn = first.querySelector('button');
      const lastBtn = last.querySelector('button');
      const firstLen = first.querySelectorAll('button').length;
      const lastLen = last.querySelectorAll('button').length;
      const firstX = firstBtn ? firstBtn.getBoundingClientRect().left : 0;
      const lastX = lastBtn ? lastBtn.getBoundingClientRect().left : 0;
      const justify = getComputedStyle(last).justifyContent;
      return {
        lastShorter: lastLen < firstLen,
        lastInset: lastX > firstX + 4,
        justify, firstX, lastX, firstLen, lastLen,
      };
    `);
    const centred = row.justify === 'center' && (!row.lastShorter || row.lastInset);
    checks.push(ok(
      'favorites:last-row-centred',
      centred,
      `justify=${row.justify} firstLen=${row.firstLen} lastLen=${row.lastLen} firstX=${Math.round(row.firstX)} lastX=${Math.round(row.lastX)}`,
    ));
    await s.screenshot(ctx.shot('favorites-picker-last-row'));
    const sprite = await s.evalJson<{
      css: number; dex: number; w: number; dpr: number; natural: number; max: number; same: boolean; inside: boolean;
    }>(`
      const el = document.querySelector('[data-testid="favorites-pretty-grid"]');
      if (!el) return { css:0, dex:0, w:0, dpr:1, natural:96, max:0, same:false, inside:false };
      const imgs = [...el.querySelectorAll('img[alt]:not([alt=""])')];
      const widths = imgs.map((node) => node.getBoundingClientRect().width);
      const rows = [...el.querySelectorAll('[data-pretty-row]')].map((row) => row.querySelectorAll('button').length);
      const dpr = window.devicePixelRatio || 1;
      const css = Number(el.getAttribute('data-sprite-px'));
      const dex = Number(el.getAttribute('data-sprite-dex'));
      const natural = Number(el.getAttribute('data-sprite-native')) || 96;
      const w = widths[0] || 0;
      const same = widths.every((n) => Math.abs(n - w) < 0.6);
      const six = el.querySelector('[data-pretty-len="6"]');
      const host = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="favorites-picker"]');
      const sb = six ? six.getBoundingClientRect() : null;
      const hb = host ? host.getBoundingClientRect() : null;
      const inside = !!sb && !!hb && sb.left >= hb.left - 0.5 && sb.right <= hb.right + 0.5;
      return { css, dex, w, dpr, natural, max: Math.max(...rows, 0), same, inside };
    `);
    const oneX = sprite.natural / Math.max(sprite.dpr, 1);
    const notShrunk = sprite.dex <= oneX + 1 || sprite.css > oneX + 1;
    checks.push(ok(
      'favorites:sprite-matches-six-col',
      sprite.same && sprite.max <= 6 && sprite.max > 0
        && Math.abs(sprite.w - sprite.css) < 0.6
        && Math.abs(sprite.css - sprite.dex) < 0.6
        && sprite.inside
        && notShrunk,
      `css=${sprite.css} dex=${sprite.dex} w=${sprite.w.toFixed(1)} inside=${sprite.inside} dpr=${sprite.dpr} oneX=${oneX.toFixed(1)}`,
    ));
    checks.push(await auditRender(s, 'favorites:render-picker'));

    const rowLens = () => s.evalJson<number[]>(`
      return [...document.querySelectorAll('[data-pretty-row]')].map((row) => Number(row.getAttribute('data-pretty-len')));
    `);
    // Escape closes the mobile sheet and the desktop pane alike.
    const closePicker = async () => {
      await s.evalJson(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`);
      await sleep(250);
    };

    const sheetOpen = await s.evalJson<boolean>(`return !!document.querySelector('[role="dialog"]');`);
    let starterRows: number[] = [];
    if (!sheetOpen) {
      checks.push({ name: 'favorites:short-sheet', status: 'skip', detail: 'desktop pane' });
      await closePicker();
      await clickCell(s, '[data-testid="favorites-cell-starter-1"]');
      if (await waitFor(s, '[data-testid="favorites-pretty-grid"]')) starterRows = await rowLens();
    } else {
      await s.evalJson(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`);
      await sleep(300);
      await clickCell(s, '[data-testid="favorites-cell-starter-1"]');
      const starter = await waitFor(s, '[data-testid="favorites-pretty-grid"]');
      if (!starter) {
        checks.push({ name: 'favorites:short-sheet', status: 'fail', detail: 'starter picker did not open' });
      } else {
        const sheet = await s.evalJson<{
          sheetH: number; sheetTop: number; max: number; gridTop: number; scrollH: number; clientH: number;
        }>(`
          const dialog = document.querySelector('[role="dialog"]');
          const grid = document.querySelector('[data-testid="favorites-grid"]');
          if (!dialog || !grid) return { sheetH:0, sheetTop:0, max:0, gridTop:0, scrollH:0, clientH:0 };
          const box = dialog.getBoundingClientRect();
          const gb = grid.getBoundingClientRect();
          const scroller = dialog.querySelector('.overflow-y-auto');
          return {
            sheetH: box.height,
            sheetTop: box.top,
            max: window.innerHeight - 56,
            gridTop: gb.top,
            scrollH: scroller ? scroller.scrollHeight : 0,
            clientH: scroller ? scroller.clientHeight : 0,
          };
        `);
        checks.push(ok(
          'favorites:short-sheet',
          sheet.sheetH < sheet.max - 40 && sheet.gridTop < sheet.sheetTop - 8 && sheet.scrollH <= sheet.clientH + 2,
          `sheetH=${Math.round(sheet.sheetH)} max=${Math.round(sheet.max)} gridTop=${Math.round(sheet.gridTop)} sheetTop=${Math.round(sheet.sheetTop)}`,
        ));
        starterRows = await rowLens();
      }
    }
    checks.push(ok('favorites:starter-lines', starterRows.join('+') === '6+5', starterRows.join('+')));
    const kantoPartners = await s.evalJson<boolean>(`
      return !!document.querySelector('[data-testid="favorites-pick-25"]')
        && !!document.querySelector('[data-testid="favorites-pick-133"]');
    `);
    checks.push(ok('favorites:kanto-starter-partners', kantoPartners));
    await closePicker();
    await clickCell(s, '[data-testid="favorites-cell-starter-8"]');
    await waitFor(s, '[data-testid="favorites-pretty-grid"]');
    const hisuiLast = await s.evalJson<boolean>(`
      const ids = [...document.querySelectorAll('[data-testid^="favorites-pick-"]')]
        .map((el) => Number(el.getAttribute('data-testid').slice('favorites-pick-'.length)));
      return ids.slice(-3).join(',') === '10233,10236,10244';
    `);
    checks.push(ok('favorites:hisui-starters-last', hisuiLast));
    await closePicker();
    await clickCell(s, '[data-testid="favorites-cell-favorite-1"]');
    await waitFor(s, '[data-testid="favorites-picker"]');
    const emptyCard = await s.evalJson<boolean>(`
      const empty = document.querySelector('[data-testid="favorites-picker-empty"]');
      return !!empty && !!empty.querySelector('svg') && !!empty.querySelector('button');
    `);
    checks.push(ok('favorites:pointer-empty-guidance', emptyCard));
    await s.screenshot(ctx.shot('favorites-pointer-empty'));
    checks.push(await auditRender(s, 'favorites:render-pointer-empty'));
    await closePicker();
    await clickCell(s, '[data-testid="favorites-cell-legendary-4"]');
    const legendOpen = await waitFor(s, '[data-testid="favorites-pretty-grid"]');
    const legendRows = legendOpen ? await rowLens() : [];
    checks.push(ok('favorites:legend-spread', legendRows.length >= 3 && legendRows.every((n) => n > 0 && n <= 6), legendRows.join('+')));
    await closePicker();
    await clickCell(s, '[data-testid="favorites-cell-water-1"]');
    const waterOpen = await waitFor(s, '[data-testid="favorites-pretty-grid"]');
    const waterRows = waterOpen ? await rowLens() : [];
    checks.push(ok('favorites:water-tail', waterRows.length >= 5 && waterRows.every((n) => n > 0 && n <= 6), waterRows.join('+')));
    await closePicker();
    await clickCell(s, '[data-testid="favorites-cell-gimmick-8"]');
    const gimmickOpen = await waitFor(s, '[data-testid="favorites-pretty-grid"]');
    const tall = gimmickOpen ? await s.evalJson<{
      mobile: boolean; rows: number; inside: boolean; noScroll: boolean; same: boolean;
    }>(`
      const dialog = document.querySelector('[role="dialog"]');
      const body = dialog?.querySelector('.overflow-y-auto');
      const grid = document.querySelector('[data-testid="favorites-pretty-grid"]');
      if (!dialog || !body || !grid) return { mobile:false, rows:0, inside:false, noScroll:false, same:false };
      const gb = grid.getBoundingClientRect();
      const bb = body.getBoundingClientRect();
      const widths = [...grid.querySelectorAll('img[alt]:not([alt=""])')].map((img) => img.getBoundingClientRect().width);
      return {
        mobile:true,
        rows:grid.querySelectorAll('[data-pretty-row]').length,
        inside:gb.top >= bb.top - 1 && gb.bottom <= bb.bottom + 1,
        noScroll:body.scrollHeight <= body.clientHeight + 2,
        same:widths.length > 0 && Math.max(...widths) - Math.min(...widths) < 0.6,
      };
    `) : { mobile: false, rows: 0, inside: false, noScroll: false, same: false };
    checks.push(tall.mobile
      ? ok('favorites:tall-selector-fits', tall.rows >= 9 && tall.inside && tall.noScroll && tall.same,
        `rows=${tall.rows} inside=${tall.inside} noScroll=${tall.noScroll} same=${tall.same}`)
      : { name: 'favorites:tall-selector-fits', status: 'skip', detail: 'desktop pane' });
    if (tall.mobile) {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const loaded = await s.evalJson<boolean>(`
          const grid = document.querySelector('[data-testid="favorites-pretty-grid"]');
          const images = grid ? [...grid.querySelectorAll('button img[src^="/sprites/pokemon/"]')] : [];
          return images.length >= 50 && images.every((img) => img.complete && img.naturalWidth > 0);
        `);
        if (loaded) break;
        await sleep(100);
      }
      await s.screenshot(ctx.shot('favorites-gimmick-8-fit'));
    }
    await closePicker();
  }

  await s.evalJson(`try{localStorage.removeItem(${JSON.stringify(FAV_KEY)});}catch{} return true;`);
  await s.navigate(url);
  if (!(await waitFavoritesGrid(s))) {
    checks.push({ name: 'favorites:packing-disabled', status: 'fail', detail: 'grid missing after reload' });
    const errs = await s.errors();
    checks.push(ok('favorites:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));
    return checks;
  }

  const placedTogetic = await pickFavorite(s, 'favorites-cell-fairy-2', 176);
  await waitGone(s, '[data-testid="favorites-picker"]');
  const placedAzu = placedTogetic && await pickFavorite(s, 'favorites-cell-water-2', 184);
  await waitGone(s, '[data-testid="favorites-picker"]');
  let openedPack = false;
  if (placedAzu) {
    await clickCell(s, '[data-testid="favorites-cell-fairy-2"]');
    if (await waitFor(s, '[data-testid="favorites-pick-184"]')) {
      const used = await s.evalJson<{
        opacity: number; mark: string | null; freeOpacity: number; freeMark: boolean;
      }>(`
        const used = document.querySelector('[data-testid="favorites-pick-184"]');
        const sprite = used ? used.querySelector('img[alt]:not([alt=""])') : null;
        const mark = used ? used.querySelector('[data-testid="favorites-used-mark"]') : null;
        const free = [...document.querySelectorAll('[data-testid^="favorites-pick-"]')].find((node) => node.getAttribute('data-testid') !== 'favorites-pick-184');
        const freeSprite = free ? free.querySelector('img[alt]:not([alt=""])') : null;
        const freeMark = free ? !!free.querySelector('[data-testid="favorites-used-mark"]') : true;
        return {
          opacity: sprite ? Number(getComputedStyle(sprite).opacity) : 1,
          mark: mark ? mark.getAttribute('data-value') : null,
          freeOpacity: freeSprite ? Number(getComputedStyle(freeSprite).opacity) : 0,
          freeMark,
        };
      `);
      checks.push(ok(
        'favorites:used-elsewhere-mark',
        used.opacity > 0.9 && used.mark === 'water' && used.freeOpacity > 0.9 && !used.freeMark,
        `opacity=${used.opacity} mark=${used.mark} freeOpacity=${used.freeOpacity} freeMark=${used.freeMark}`,
      ));
      const iconsHidden = await s.evalJson<boolean>(`return document.querySelector('[data-testid="favorites-type-toggle"]')?.getAttribute('aria-pressed') === 'false';`);
      if (iconsHidden) await s.click('[data-testid="favorites-type-toggle"]');
      const types = await s.evalJson<{ icons: string[]; same: boolean }>(`
        const btn = document.querySelector('[data-testid="favorites-pick-184"]');
        if (!btn) return { icons: [], same: false };
        const icons = [...btn.querySelectorAll('[data-testid="favorites-type-icon"]')].map((node) => node.getAttribute('data-type') || '');
        const sprite = btn.querySelector('img[alt]:not([alt=""])');
        const same = !!sprite && Math.abs(btn.getBoundingClientRect().height - sprite.getBoundingClientRect().height) < 1;
        return { icons, same };
      `);
      const iconSet = types.icons.slice().sort().join(',');
      checks.push(ok(
        'favorites:selector-type-icons',
        iconSet === 'fairy,water' && types.same,
        `icons=${types.icons.join(',')} same=${types.same}`,
      ));
      await s.click('[data-testid="favorites-pick-184"]');
      openedPack = await waitFor(s, '[data-testid="favorites-packing"]');
    } else {
      checks.push({ name: 'favorites:used-elsewhere-mark', status: 'fail', detail: 'fairy picker did not list Azumarill' });
      checks.push({ name: 'favorites:selector-type-icons', status: 'fail', detail: 'fairy picker did not list Azumarill' });
    }
  }
  checks.push(ok('favorites:packing-disabled', placedTogetic && placedAzu && !openedPack, `togetic=${placedTogetic} azu=${placedAzu} packing=${openedPack}`));
  if (openedPack) {
    const moved = await s.evalJson<{
      count: number; azu: number; opacity: number; oldLeft: boolean; arrowBetween: boolean; newRight: boolean; layered: boolean;
    }>(`
      const options = [...document.querySelectorAll('[data-testid="favorites-pack-option"]')];
      const option = options.find((node) => !node.querySelector('[data-role="trash"]'));
      const slot = option?.querySelector('[data-testid="favorites-pack-slot"]');
      const sprites = [...(option?.querySelectorAll('[data-testid="favorites-pack-sprite"]') || [])];
      const sprite = slot?.querySelector('[data-testid="favorites-pack-sprite"]');
      const old = slot?.querySelector('[data-testid="favorites-pack-old-mark"]');
      const arrow = slot?.querySelector('[data-testid="favorites-pack-move-arrow"]');
      const next = slot?.querySelector('[data-testid="favorites-pack-new-mark"]');
      const box = slot?.getBoundingClientRect();
      const a = old?.getBoundingClientRect();
      const b = arrow?.getBoundingClientRect();
      const c = next?.getBoundingClientRect();
      return {
        count: sprites.length,
        azu: sprites.filter((node) => /azumarill/i.test(node.getAttribute('alt') || '')).length,
        opacity: sprite ? Number(getComputedStyle(sprite).opacity) : 0,
        oldLeft: !!(a && box && a.left <= box.left + 1),
        arrowBetween: !!(a && b && c && a.right < b.left && b.right < c.left),
        newRight: !!(c && box && c.right >= box.right - 1),
        layered: !!(old && next && sprite && Number(getComputedStyle(old).zIndex) > Number(getComputedStyle(sprite).zIndex) && Number(getComputedStyle(next).zIndex) > Number(getComputedStyle(sprite).zIndex)),
      };
    `);
    checks.push(ok(
      'favorites:pack-one-solid-move',
      moved.count === 2 && moved.azu === 1 && moved.opacity === 1 && moved.oldLeft && moved.arrowBetween && moved.newRight && moved.layered,
      `sprites=${moved.count} azumarill=${moved.azu} opacity=${moved.opacity} oldLeft=${moved.oldLeft} arrow=${moved.arrowBetween} newRight=${moved.newRight} layered=${moved.layered}`,
    ));
    const trash = await s.evalJson<{
      found: boolean; opacity: number; alt: string; outlined: boolean;
      red: boolean; white: boolean; layered: boolean; oldLeft: boolean; arrowBetween: boolean; trashRight: boolean; mark: string;
    }>(`
      const slot = document.querySelector('[data-testid="favorites-pack-slot"][data-role="trash"]');
      if (!slot) return { found:false, opacity:1, alt:'', outlined:true, red:false, white:false, layered:false, oldLeft:false, arrowBetween:false, trashRight:false, mark:'' };
      const sprite = slot.querySelector('[data-testid="favorites-pack-sprite"]');
      const old = slot.querySelector('[data-testid="favorites-pack-old-mark"]');
      const arrow = slot.querySelector('[data-testid="favorites-pack-move-arrow"]');
      const mark = slot.querySelector('[data-testid="favorites-trash-mark"]');
      const box = slot.getBoundingClientRect();
      const a = old?.getBoundingClientRect();
      const b = arrow?.getBoundingClientRect();
      const c = mark?.getBoundingClientRect();
      const outlined = Number.parseFloat(getComputedStyle(slot).borderTopWidth) > 0;
      const bg = mark ? getComputedStyle(mark).backgroundColor : '';
      const icon = mark ? getComputedStyle(mark).color : '';
      const oklch = bg.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/);
      const rgb = bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      const hue = oklch ? Number(oklch[3]) : -1;
      const red = (hue >= 0 && (hue <= 40 || hue >= 350)) || (rgb ? Number(rgb[1]) > 150 && Number(rgb[2]) < 90 && Number(rgb[3]) < 90 : false);
      return {
        found: true,
        opacity: sprite ? Number(getComputedStyle(sprite).opacity) : 1,
        alt: sprite ? sprite.getAttribute('alt') || '' : '',
        outlined,
        red,
        white: icon === 'rgb(255, 255, 255)',
        layered: !!(mark && sprite && Number(getComputedStyle(mark).zIndex) > Number(getComputedStyle(sprite).zIndex)),
        oldLeft: !!(a && a.left <= box.left + 1),
        arrowBetween: !!(a && b && c && a.right < b.left && b.right < c.left),
        trashRight: !!(c && c.right >= box.right - 1),
        mark: bg,
      };
    `);
    checks.push(ok(
      'favorites:trash-kicked-sprite',
      trash.found && trash.opacity < 0.5 && trash.alt.length > 0 && !trash.outlined && trash.red && trash.white && trash.layered && trash.oldLeft && trash.arrowBetween && trash.trashRight,
      `alt=${trash.alt} opacity=${trash.opacity} outlined=${trash.outlined} layered=${trash.layered} oldLeft=${trash.oldLeft} arrow=${trash.arrowBetween} trashRight=${trash.trashRight} mark=${trash.mark}`,
    ));
    await s.screenshot(ctx.shot('favorites-packing-moves'));
    // Keep this audit scoped to the packing sheet so grid findings stay separate.
    try {
      const result = await s.evalJson<{ findings: AuditFinding[] }>(auditBody({ minFont: 8, annotate: false, checkFrame: false, offCanvasOk: true }));
      const hard = result.findings.filter((f) => APP_HARD_KINDS.includes(f.kind) && /pack/i.test(`${f.path} ${f.text}`));
      const detail = hard.slice(0, 4).map((f) => `${f.kind}: ${f.detail} (${f.text || f.path})`).join(' | ');
      checks.push({
        name: 'favorites:render-packing',
        status: hard.length === 0 ? 'pass' : 'fail',
        detail: hard.length ? `${hard.length} hard finding(s): ${detail}` : `${result.findings.length} page finding(s), none in packing UI`,
        findings: hard.map(findingKey),
      });
    } catch (e) {
      checks.push({ name: 'favorites:render-packing', status: 'fail', detail: `audit did not run: ${(e as Error).message.slice(0, 120)}` });
    }
  }

  const oracle = await s.evalJson<{ has: boolean; fairy?: number; water?: number }>(`
    const raw=localStorage.getItem(${JSON.stringify(FAV_KEY)});
    if(!raw) return {has:false};
    try { const d=JSON.parse(raw); const f=d.state?.fills||{}; return {has:true, fairy:f['fairy|2'], water:f['water|2']}; }
    catch { return {has:false}; }
  `);
  checks.push(ok(
    'favorites:store-has-placements',
    Boolean(oracle.has && oracle.fairy === 184 && oracle.water === 184),
    `fairy=${oracle.fairy} water=${oracle.water}`,
  ));

  if (openedPack) {
    const applied = await s.evalJson<boolean>(`
      const options = [...document.querySelectorAll('[data-testid="favorites-pack-option"]')];
      const trash = options.find((node) => node.querySelector('[data-role="trash"]'));
      const target = trash || options[0];
      if (!target) return false;
      target.click();
      return true;
    `);
    await sleep(350);
    const landed = await s.evalJson<{ fairy?: number; water?: number; togetic: boolean }>(`
      const raw = localStorage.getItem(${JSON.stringify(FAV_KEY)});
      const fills = raw ? (JSON.parse(raw).state?.fills || {}) : {};
      const values = Object.values(fills);
      return { fairy: fills['fairy|2'], water: fills['water|2'], togetic: values.includes(176) };
    `);
    checks.push(ok(
      'favorites:pack-lands-in-opened-cell',
      Boolean(applied && landed.fairy === 184 && landed.water !== 184 && !landed.togetic),
      `applied=${applied} fairy=${landed.fairy} water=${landed.water} togetic=${landed.togetic}`,
    ));
  } else {
    checks.push(ok('favorites:direct-replacement', oracle.fairy === 184 && oracle.water === 184, `fairy=${oracle.fairy} water=${oracle.water}`));
  }

  const dismiss = async () => {
    const open = await s.evalJson<boolean>(`return !!document.querySelector('[data-testid="favorites-picker"]');`);
    if (!open) return;
    await s.evalJson(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`);
    await sleep(250);
  };

  await dismiss();
  await clickCell(s, '[data-testid="favorites-cell-normal-1"]');
  if (await waitFor(s, '[data-testid="favorites-picker"]')) {
    const emptyRing = await s.evalJson<{ ring: string; ball: string }>(`
      const cell = document.querySelector('[data-testid="favorites-cell-normal-1"]');
      const ring = cell ? cell.querySelector('[data-testid="favorites-focus-ring"]') : null;
      const ball = cell ? cell.querySelector('[data-testid="favorites-empty-ball"]') : null;
      return {
        ring: ring ? getComputedStyle(ring).zIndex : '',
        ball: ball ? getComputedStyle(ball).zIndex : '',
      };
    `);
    const ballUnder = emptyRing.ball === 'auto' || Number(emptyRing.ball) < Number(emptyRing.ring);
    checks.push(ok(
      'favorites:empty-ring-above-ball',
      Number(emptyRing.ring) >= 5 && ballUnder,
      `ring=${emptyRing.ring} ball=${emptyRing.ball}`,
    ));
  } else {
    checks.push({ name: 'favorites:empty-ring-above-ball', status: 'fail', detail: 'empty cell did not open' });
  }
  await dismiss();

  await clickCell(s, '[data-testid="favorites-cell-fairy-2"]');
  if (await waitFor(s, '[data-testid="favorites-pretty-grid"]')) {
    await s.screenshot(ctx.shot('favorites-selector-clear'));
    const filled = await s.evalJson<{
      ring: string; sprite: string; top: number; scrollTop: number; clearW: number; pickW: number; inGrid: boolean; text: string;
    }>(`
      const cell = document.querySelector('[data-testid="favorites-cell-fairy-2"]');
      const ring = cell ? cell.querySelector('[data-testid="favorites-focus-ring"]') : null;
      const sprite = cell ? cell.querySelector('img[alt]') : null;
      const btn = document.querySelector('[data-testid^="favorites-pick-"]');
      const scroller = btn ? btn.closest('.overflow-y-auto') : null;
      const br = btn ? btn.getBoundingClientRect() : null;
      const sr = scroller ? scroller.getBoundingClientRect() : null;
      const clear = document.querySelector('[data-testid="favorites-clear"]');
      const pick = document.querySelector('[data-testid^="favorites-pick-"]');
      return {
        ring: ring ? getComputedStyle(ring).zIndex : '',
        sprite: sprite ? getComputedStyle(sprite).zIndex : '',
        top: br && sr ? br.top - 3 - sr.top : -1,
        scrollTop: sr ? sr.top : 0,
        clearW: clear ? clear.getBoundingClientRect().width : 0,
        pickW: pick ? pick.getBoundingClientRect().width : 0,
        inGrid: !!(clear && clear.closest('[data-testid="favorites-pretty-grid"]')),
        text: clear ? (clear.textContent || '').trim() : '',
      };
    `);
    checks.push(ok(
      'favorites:filled-sprite-above-ring',
      Number(filled.sprite) > Number(filled.ring) && Number(filled.ring) >= 5,
      `sprite=${filled.sprite} ring=${filled.ring}`,
    ));
    checks.push(ok(
      'favorites:selector-ring-inside',
      filled.top >= -0.5,
      `ringTopGap=${filled.top.toFixed(1)}`,
    ));
    checks.push(ok(
      'favorites:clear-inside-selected-cell',
      filled.inGrid && filled.text === '' && filled.clearW >= filled.pickW * 0.5 && filled.clearW < filled.pickW && filled.pickW > 20,
      `inGrid=${filled.inGrid} text=${JSON.stringify(filled.text)} clearW=${filled.clearW.toFixed(1)} pickW=${filled.pickW.toFixed(1)}`,
    ));
    const overflow = await s.evalJson<{ x: string; y: string }>(`
      const cell = document.querySelector('[data-testid="favorites-cell-fairy-2"]');
      const style = cell ? getComputedStyle(cell) : null;
      return { x: style?.overflowX || '', y: style?.overflowY || '' };
    `);
    checks.push(ok(
      'favorites:filled-sprite-unclipped',
      overflow.x === 'visible' && overflow.y === 'visible',
      `overflowX=${overflow.x} overflowY=${overflow.y}`,
    ));
  } else {
    checks.push({ name: 'favorites:filled-sprite-above-ring', status: 'fail', detail: 'filled picker did not open' });
    checks.push({ name: 'favorites:selector-ring-inside', status: 'fail', detail: 'filled picker did not open' });
    checks.push({ name: 'favorites:clear-inside-selected-cell', status: 'fail', detail: 'filled picker did not open' });
    checks.push({ name: 'favorites:filled-sprite-unclipped', status: 'fail', detail: 'filled picker did not open' });
  }
  await dismiss();

  await s.evalJson(`
    const el = document.querySelector('[data-testid="favorites-grid-scroll"]') || document.querySelector('[data-testid="favorites-grid"]');
    const map = document.querySelector('[data-testid="favorites-minimap"]');
    const seen = { shown: false };
    window.__verifyFavoritesMinimap = seen;
    if (map) new MutationObserver(() => {
      if (Number(map.style.opacity) > 0.05) seen.shown = true;
    }).observe(map, { attributes: true, attributeFilter: ['style'] });
    if (el) {
      el.scrollLeft = Math.round(el.clientWidth * 0.85);
      el.dispatchEvent(new Event('scroll'));
    }
    return true;
  `);
  await sleep(40);
  const mini = await s.evalJson<{
    overflow: boolean; shown: boolean; vpNarrower: boolean;
    cells: number; gridCells: number; filled: number; empty: number; stroke: string; offset: string; primary: string; tinted: boolean;
  }>(`
    const el = document.querySelector('[data-testid="favorites-grid-scroll"]') || document.querySelector('[data-testid="favorites-grid"]');
    const map = document.querySelector('[data-testid="favorites-minimap"]');
    const vp = document.querySelector('[data-testid="favorites-minimap-viewport"]');
    const overflow = !!el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    const shown = !!map && (window.__verifyFavoritesMinimap?.shown || Number(getComputedStyle(map).opacity) > 0.05);
    const vpNarrower = !!(map && vp && vp.getBoundingClientRect().width < map.getBoundingClientRect().width - 1 && vp.getBoundingClientRect().width > 2);
    const sample = document.createElement('span');
    sample.style.color = 'var(--color-primary)';
    document.body.appendChild(sample);
    const primary = getComputedStyle(sample).color;
    sample.remove();
    const filledCell = map?.querySelector('[data-type="fairy"][data-filled="true"]');
    const emptyCell = map?.querySelector('[data-type="fairy"][data-filled="false"]');
    return {
      overflow, shown, vpNarrower,
      cells: map?.querySelectorAll('[data-kind]').length || 0,
      gridCells: document.querySelectorAll('[data-testid="favorites-grid"] [data-testid^="favorites-cell-"]').length,
      filled: map?.querySelectorAll('[data-filled="true"]').length || 0,
      empty: map?.querySelectorAll('[data-filled="false"]').length || 0,
      stroke: vp ? getComputedStyle(vp).outlineColor : '',
      offset: vp ? getComputedStyle(vp).outlineOffset : '',
      tinted: !!filledCell && !!emptyCell && getComputedStyle(filledCell).backgroundColor !== getComputedStyle(emptyCell).backgroundColor,
      primary,
    };
  `);
  checks.push(ok(
    'favorites:minimap-when-overflow',
    mini.overflow ? mini.shown && mini.vpNarrower : !mini.shown,
    `overflow=${mini.overflow} shown=${mini.shown} vp=${mini.vpNarrower}`,
  ));
  checks.push(ok(
    'favorites:minimap-body-cells',
    !mini.overflow || (mini.gridCells > 0 && mini.cells === mini.gridCells && mini.filled > 0 && mini.empty > 0 && mini.stroke === mini.primary && mini.offset === '1px' && mini.tinted),
    `cells=${mini.cells} gridCells=${mini.gridCells} filled=${mini.filled} empty=${mini.empty} stroke=${mini.stroke} offset=${mini.offset} tinted=${mini.tinted} primary=${mini.primary}`,
  ));
  if (mini.shown) await s.screenshot(ctx.shot('favorites-minimap-scrolling'));
  // The phone minimap stays 2 s after the last scroll so a finger can reach
  // it, so allow up to 3.5 s for the fade.
  let miniIdle = 1;
  for (let waited = 0; waited < 3500 && miniIdle >= 0.05; waited += 250) {
    await sleep(250);
    miniIdle = await s.evalJson<number>(`
      const map = document.querySelector('[data-testid="favorites-minimap"]');
      return map ? Number(getComputedStyle(map).opacity) : 0;
    `);
  }
  checks.push(ok('favorites:minimap-fades-idle', miniIdle < 0.05, `opacity=${miniIdle}`));

  await clickCell(s, '[data-testid="favorites-cell-poison-1"]');
  const poisonOpen = await waitFor(s, '[data-testid="favorites-pick-34"]');
  if (poisonOpen) await s.click('[data-testid="favorites-pick-34"]');
  await sleep(250);
  await dismiss();
  await clickCell(s, '[data-testid="favorites-cell-ground-1"]');
  const groundOpen = await waitFor(s, '[data-testid="favorites-pick-76"]');
  if (groundOpen) await s.click('[data-testid="favorites-pick-76"]');
  await sleep(300);
  await dismiss();
  await clickCell(s, '[data-testid="favorites-cell-rock-1"]');
  const rockOpen = await waitFor(s, '[data-testid="favorites-pick-76"]');
  if (rockOpen) await s.click('[data-testid="favorites-pick-76"]');
  await sleep(350);
  const moved = await s.evalJson<{ packing: boolean; rock?: number; ground?: number; poison?: number }>(`
    const raw = localStorage.getItem(${JSON.stringify(FAV_KEY)});
    const fills = raw ? (JSON.parse(raw).state?.fills || {}) : {};
    return {
      packing: !!document.querySelector('[data-testid="favorites-packing"]'),
      rock: fills['rock|1'],
      ground: fills['ground|1'],
      poison: fills['poison|1'],
    };
  `);
  checks.push(ok(
    'favorites:empty-dest-preserves-source',
    Boolean(poisonOpen && groundOpen && rockOpen && !moved.packing && moved.rock === 76 && moved.ground === 76 && moved.poison === 34),
    `packing=${moved.packing} rock=${moved.rock} ground=${moved.ground} poison=${moved.poison}`,
  ));
  await dismiss();

  await s.evalJson(`try{localStorage.removeItem(${JSON.stringify(FAV_KEY)});}catch{} return true;`);
  await s.navigate(url);
  const directReady = await waitFavoritesGrid(s);
  const placedPikachu = directReady && await pickFavorite(s, 'favorites-cell-electric-1', 25);
  await waitGone(s, '[data-testid="favorites-picker"]');
  const placedRaichu = placedPikachu && await pickFavorite(s, 'favorites-cell-electric-1', 26);
  const direct = await s.evalJson<{ id?: number; packing: boolean; picker: boolean }>(`
    const raw = localStorage.getItem(${JSON.stringify(FAV_KEY)});
    const fills = raw ? (JSON.parse(raw).state?.fills || {}) : {};
    return {
      id: fills['electric|1'],
      packing: !!document.querySelector('[data-testid="favorites-packing"]'),
      picker: !!document.querySelector('[data-testid="favorites-picker"]'),
    };
  `);
  checks.push(ok(
    'favorites:direct-trash-swap',
    Boolean(placedRaichu && direct.id === 26 && !direct.packing && !direct.picker),
    `ready=${directReady} pikachu=${placedPikachu} raichu=${placedRaichu} id=${direct.id} packing=${direct.packing}`,
  ));

  // App zoom. Synthetic ctrl+wheel events reach the same handler as a
  // trackpad pinch on every engine. Zoomed and scrolled to the far corner,
  // the last cell must sit inside the frame, the headers on its edges, and
  // the minimap inside it without a transform.
  await s.evalJson(`
    const el = document.querySelector('[data-testid="favorites-grid-scroll"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      el.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    }
    return true;
  `);
  await sleep(300);
  const zoom = await s.evalJson<{
    zoom: number; cellGrew: boolean; lastInside: boolean; headerTop: number; genLeft: number; mapInside: boolean; mapTransform: string;
  }>(`
    const el = document.querySelector('[data-testid="favorites-grid-scroll"]');
    const before = Number(el?.getAttribute('data-zoom') || 0);
    if (!el) return { zoom: 0, cellGrew: false, lastInside: false, headerTop: -1, genLeft: -1, mapInside: false, mapTransform: '' };
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = el.scrollHeight;
    const frame = el.getBoundingClientRect();
    const inner = { left: frame.left + el.clientLeft, top: frame.top + el.clientTop };
    inner.right = inner.left + el.clientWidth;
    inner.bottom = inner.top + el.clientHeight;
    const last = document.querySelector('[data-testid="favorites-cell-favorite-favorite"]').getBoundingClientRect();
    const grid = document.querySelector('[data-testid="favorites-grid"]');
    const headers = [...grid.querySelectorAll(':scope > div:not([data-row-banded])')].map((h) => h.getBoundingClientRect().top);
    const gens = [...document.querySelectorAll('div[data-row-banded]')].map((g) => g.getBoundingClientRect().left);
    const map = document.querySelector('[data-testid="favorites-minimap"]');
    const box = map ? map.getBoundingClientRect() : null;
    return {
      zoom: before,
      cellGrew: document.querySelector('[data-testid="favorites-cell-normal-1"]').getBoundingClientRect().width > el.clientHeight / 13 * 1.5,
      lastInside: last.right <= inner.right + 1 && last.bottom <= inner.bottom + 1 && last.left >= inner.left - 1 && last.top >= inner.top - 1,
      headerTop: Math.round((Math.min(...headers) - inner.top) * 10) / 10,
      genLeft: Math.round((Math.min(...gens) - inner.left) * 10) / 10,
      mapInside: !!box && box.left >= frame.left && box.right <= frame.right && box.top >= frame.top && box.bottom <= frame.bottom,
      mapTransform: map ? getComputedStyle(map).transform : '',
    };
  `);
  checks.push(ok('favorites:zoom-grows-cells', zoom.zoom > 1.5 && zoom.cellGrew, `data-zoom=${zoom.zoom} cellGrew=${zoom.cellGrew}`));
  checks.push(ok('favorites:zoom-reaches-far-corner', zoom.zoom > 1.5 && zoom.lastInside, `lastInside=${zoom.lastInside}`));
  checks.push(ok(
    'favorites:zoom-sticky-headers',
    zoom.zoom > 1.5 && Math.abs(zoom.headerTop) < 1 && Math.abs(zoom.genLeft) < 1,
    `headerTop-frame=${zoom.headerTop} genLeft-frame=${zoom.genLeft}`,
  ));
  checks.push(ok(
    'favorites:zoom-minimap-in-frame',
    zoom.mapInside && zoom.mapTransform === 'none',
    `inside=${zoom.mapInside} transform=${zoom.mapTransform}`,
  ));
  if (zoom.zoom > 1.5) await s.screenshot(ctx.shot('favorites-zoomed-far-corner'));

  const errs = await s.errors();
  checks.push(ok('favorites:no-js-errors', errs.length === 0, errs.slice(0, 3).join(' | ')));
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
  const tiltVars = await s.evalJson<{ rot: string; holo: string; glare: string; holoBlend: string; glareBlend: string }>(
    `const el=document.querySelector('[data-export-preview]');
     const holoEl=document.querySelector('[data-foil-layer="holographic"]');
     if(!(el instanceof HTMLElement) || !(holoEl instanceof HTMLElement)) return {rot:'',holo:'',glare:'',holoBlend:'',glareBlend:''};
     const s=getComputedStyle(el);
     return {
       rot: s.getPropertyValue('--hover-tilt-rotation-x').trim(),
       holo: s.getPropertyValue('--foil-holographic').trim(),
       glare: s.getPropertyValue('--hover-tilt-glare-intensity').trim(),
       holoBlend: getComputedStyle(holoEl).mixBlendMode,
       glareBlend: getComputedStyle(el,'::before').mixBlendMode,
     };`,
  ).catch(() => ({ rot: '', holo: '', glare: '', holoBlend: '', glareBlend: '' }));
  checks.push(ok('foil-workshop:hover-tilt-rotation', /^14\.29deg$/.test(tiltVars.rot), `rot=${tiltVars.rot}`));
  checks.push(ok('foil-workshop:prod-holo', Math.abs(Number(tiltVars.holo) - 0.7) < 0.02, `holo=${tiltVars.holo}`));
  checks.push(ok('foil-workshop:prod-glare', Math.abs(Number(tiltVars.glare) - 1) < 0.02, `glare=${tiltVars.glare}`));
  checks.push(ok('foil-workshop:prod-holo-blend', tiltVars.holoBlend === 'color-dodge', `blend=${tiltVars.holoBlend}`));
  checks.push(ok('foil-workshop:prod-glare-blend', tiltVars.glareBlend === 'overlay', `blend=${tiltVars.glareBlend}`));
  await s.screenshot(ctx.shot('foil-workshop'));

  const controls = await s.evalJson<{
    holo: boolean;
    glare: boolean;
    shadow: boolean;
    selectors: number;
    sparkle: boolean;
    extras: string[];
  }>(
    `const has=(sel)=>!!document.querySelector(sel);
     const extras=[...document.querySelectorAll('[data-foil-slider],[data-hover-tilt-mask],[data-workshop-dark-card-toggle]')]
       .map((el)=>el.getAttribute('data-foil-slider')||el.getAttribute('data-hover-tilt-mask')||el.getAttribute('data-workshop-dark-card-toggle')||el.tagName)
       .filter((id)=>!['holographic','holoRainbow','pointLight','iridescence','maxTilt','glareIntensity','glareSize','shadowBlur'].includes(id));
     return {
        holo: has('[data-foil-slider="holographic"]') && has('[data-foil-slider="holoRainbow"]') && has('[data-foil-slider="maxTilt"]'),
        glare: has('[data-foil-slider="glareIntensity"]'),
        shadow: has('[data-workshop-shadow-toggle]') && has('[data-foil-slider="shadowBlur"]'),
        selectors: document.querySelectorAll('[data-hover-tilt-select]').length,
        sparkle: has('[data-foil-layer="sparkle"]'),
        extras,
      };`,
  ).catch(() => ({ holo: false, glare: false, shadow: false, selectors: 1, sparkle: true, extras: ['eval'] }));
  checks.push(ok('foil-workshop:keepers', controls.holo && controls.glare && controls.shadow, JSON.stringify(controls)));
  checks.push(ok('foil-workshop:no-extras', controls.extras.length === 0 && controls.selectors === 0 && !controls.sparkle, JSON.stringify(controls)));

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
  const hypotOk = (h: number) => h > 1.2 && h <= 10.2;

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
    const league = await measureSharedExportFoil(s, hypotOk);
    await s.screenshot(ctx.shot('league-export-foil'));
    checks.push(ok(
      'league-export:rainbow-foil',
      league.img && league.maps && league.rainbow.ok && hypotOk(league.hypot),
      `${league.rainbow.reason} hypot=${league.hypot.toFixed(1)} orbit=${league.orbit} maps=${league.maps} after ${league.waited}ms`,
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
  const gym = await measureSharedExportFoil(s, hypotOk);
  await s.screenshot(ctx.shot('gym-export-foil'));
  checks.push(ok(
    'gym-export:rainbow-foil',
    gym.img && gym.maps && gym.rainbow.ok && hypotOk(gym.hypot),
    `${gym.rainbow.reason} hypot=${gym.hypot.toFixed(1)} orbit=${gym.orbit} maps=${gym.maps} after ${gym.waited}ms`,
  ));
  await closeExportOverlay(s);
  return checks;
}

const NIMBUS_LEAGUE =
  "JSON.stringify({state:{name:'',cards:(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,signatureId:null,partnerId:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const cards=Array.from({length:14},empty);cards[0]={type:'flying',theme:'Clouds',lines:[{branch:[333,334],boundaries:[1,6]},{branch:[179,180,181],boundaries:[1,4,8]}],signatureSeat:1,signatureId:334,partnerId:179,tmMoveId:538,badgeName:'Nimbus',legend:null,powerup:null};return cards;})()},version:1})";
const NIMBUS_SOLO_LEAGUE = NIMBUS_LEAGUE.replace('partnerId:179', 'partnerId:null');
const SABRINA_SOLO_LEAGUE =
  "JSON.stringify({state:{name:'',cards:(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,signatureId:null,partnerId:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const cards=Array.from({length:14},empty);cards[0]={type:'psychic',theme:'Sabrina',lines:[{branch:[63,64,65],boundaries:[1,4,8]}],signatureSeat:1,signatureId:65,partnerId:null,tmMoveId:94,badgeName:'Marsh',legend:null,powerup:null};return cards;})()},version:1})";

/**
 * Gym-card export preview for the Nimbus/Cotton Guard card. Proves the overlay
 * paints a real PNG of that card; layout parity lives in layout.test.ts.
 */
/**
 * The league export starts at the team the league tab shows: Rematch on the
 * Rematch tab, Story on the Story tab. The pane marks its team with a tinted
 * background, so exactly one `[data-export-team]` paints one.
 */
export async function runLeagueExportTeamSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;
  for (const [view, team] of [['rematch', 'rematch'], ['challenge', 'story']] as const) {
    const name = `league-export:starts-at-${view}-tab`;
    await s.navigate(url);
    if (!(await waitLeagueHome(s))) {
      checks.push({ name, status: 'skip', detail: 'league home never hydrated' });
      continue;
    }
    if (!(await clickHandle(s, `[data-league-view="${view}"]`))) {
      checks.push({ name, status: 'fail', detail: 'tab never rendered' });
      continue;
    }
    await sleep(400);
    if (!(await clickHandle(s, '[data-league-export="league"]')) || !(await waitFor(s, '[data-export-team]', 40))) {
      checks.push({ name, status: 'fail', detail: 'export pane never opened' });
      continue;
    }
    await sleep(1000);
    const tinted = await s.evalJson<string[]>(
      `const clear=(c)=>c==='transparent'||/rgba\\([^)]*,\\s*0\\)$/.test(c);
       return [...document.querySelectorAll('[data-export-team]')]
         .filter((el)=>!clear(getComputedStyle(el).backgroundColor))
         .map((el)=>el.getAttribute('data-export-team'));`,
    );
    checks.push(ok(name, tinted.length === 1 && tinted[0] === team, `tinted=${tinted.join(',') || 'none'} want=${team}`));
    await s.screenshot(ctx.shot(`league-export-${view}-tab`));
  }
  return checks;
}

export async function runGymCardExportParitySuite(
  s: Session,
  _persona: PersonaName | null,
  ctx: FlowContext,
): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:nimbus-preview', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${NIMBUS_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:nimbus-preview', status: 'skip', detail: 'league home never hydrated after seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-tm"]', 40))) {
    checks.push({ name: 'gym-export:nimbus-preview', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(600);
  const scale = await s.evalJson<{ css: number; n: number; integer: boolean }>(
    `const pane=document.querySelector('[data-ace-partner-slot]');
     const art=pane&&pane.querySelector('[data-slot-art]');
     const rem=parseFloat(getComputedStyle(document.documentElement).fontSize);
     const css=art?art.offsetWidth:0;
     const n=css/(3.25*rem);
     return {css,n,integer:[1,2,3].some(s=>Math.abs(n-s)<0.02)};`,
  );
  checks.push(ok(
    'gym-export:ace-integer-scale',
    scale.integer,
    `css=${scale.css} n=${scale.n.toFixed(3)} (want 1, 2, or 3 × 3.25rem)`,
  ));
  const tmFit = await s.evalJson<{ tmW: number; chipRight: number; tmRight: number; inside: boolean }>(
    `const tm=document.querySelector('[data-testid="slot-tm"]');
     const chip=tm&&tm.querySelector('img[src*="/sprites/moves/"]');
     const box=chip&&chip.parentElement;
     const r=tm&&tm.getBoundingClientRect();
     const c=box&&box.getBoundingClientRect();
     const tmRight=r?r.right:0;
     const chipRight=c?c.right:0;
     return {tmW:r?r.width:0,chipRight,tmRight,inside:!!c&&chipRight<=tmRight+0.5};`,
  );
  checks.push(ok(
    'gym-export:tm-chip-inside-cell',
    tmFit.inside && tmFit.tmW > 70,
    `tmW=${tmFit.tmW.toFixed(1)} chipRight=${tmFit.chipRight.toFixed(1)} tmRight=${tmFit.tmRight.toFixed(1)}`,
  ));
  // The card's own export, not the league pane's: both carry the attribute, and
  // the league pane's comes first in the DOM, which WebKit and Gecko pick.
  await s.click('[data-league-export="card"]');
  if (!(await waitFor(s, '[data-export-preview] img', 60))) {
    checks.push({ name: 'gym-export:nimbus-preview', status: 'fail', detail: 'export preview image never mounted' });
    return checks;
  }
  await sleep(800);
  // A card export has no league detail toggles; the league export has four.
  // That tells the two apart, which a width floor alone did not.
  const painted = await s.evalJson<{ w: number; complete: boolean; details: number }>(
    `const img=document.querySelector('[data-export-preview] img');
     return { w: img?.naturalWidth ?? 0, complete: !!img?.complete, details: document.querySelectorAll('[data-export-detail]').length };`,
  );
  await s.screenshot(ctx.shot('gym-export-nimbus-preview'));
  checks.push(ok(
    'gym-export:nimbus-preview',
    painted.complete && painted.w > 800 && painted.details === 0,
    `preview naturalWidth=${painted.w} complete=${painted.complete} leagueDetailToggles=${painted.details}`,
  ));

  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${NIMBUS_SOLO_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:solo-ace-panel', status: 'skip', detail: 'league home never hydrated after solo seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-tm"]', 40))) {
    checks.push({ name: 'gym-export:solo-ace-panel', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(600);
  const solo = await s.evalJson<{
    mode: string | null;
    seam: boolean;
    arts: number;
    heads: string;
    cx: number;
    cy: number;
    integer: boolean;
    n: number;
  }>(
    `const pane=document.querySelector('[data-ace-partner-slot]');
     const cluster=document.querySelector('[data-testid="slot-ace"]');
     const art=pane&&pane.querySelector('[data-slot-art]');
     if(!pane||!cluster) return {mode:null,seam:true,arts:0,heads:'',cx:0,cy:0,integer:false,n:0};
     const pr=pane.getBoundingClientRect();
     const cr=cluster.getBoundingClientRect();
     const rem=parseFloat(getComputedStyle(document.documentElement).fontSize);
     const css=art?art.offsetWidth:0;
     const n=css/(3.25*rem);
     return {
       mode: pane.getAttribute('data-showcase'),
       seam: !!pane.querySelector(':scope > svg line'),
       arts: pane.querySelectorAll('[data-slot-art] img').length,
       heads: [...pane.querySelectorAll('[data-slot-head]')].map(e=>e.getAttribute('data-slot-head')).join(','),
       cx: (cr.left+cr.width/2-pr.left)/pr.width,
       cy: (cr.top+cr.height/2-pr.top)/pr.height,
       integer: [1,2,3].some(s=>Math.abs(n-s)<0.02),
       n,
     };`,
  );
  await s.screenshot(ctx.shot('gym-export-solo-ace'));
  const centred = Math.abs(solo.cx - 0.5) < 0.08 && Math.abs(solo.cy - 0.5) < 0.08;
  const heads = solo.heads.split(',');
  checks.push(ok(
    'gym-export:solo-ace-panel',
    solo.mode === 'split' && solo.seam && solo.arts === 1 && heads.includes('ace') && heads.includes('partner') && !centred,
    `mode=${solo.mode} seam=${solo.seam} arts=${solo.arts} heads=${solo.heads} cx=${solo.cx.toFixed(2)} cy=${solo.cy.toFixed(2)}`,
  ));
  checks.push(ok(
    'gym-export:solo-ace-integer-scale',
    solo.integer,
    `n=${solo.n.toFixed(3)} (want 1, 2, or 3 × 3.25rem)`,
  ));

  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${SABRINA_SOLO_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:ace-name-inside-pane', status: 'skip', detail: 'league home never hydrated after Alakazam seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-ace"]', 40))) {
    checks.push({ name: 'gym-export:ace-name-inside-pane', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(800);
  const aceName = await s.evalJson<{
    text: string;
    ellipsis: boolean;
    lastInsidePane: boolean;
    mode: string | null;
    partner: boolean;
    seam: boolean;
  }>(
    `const pane=document.querySelector('[data-ace-partner-slot]');
     const cluster=pane&&pane.querySelector('[data-testid="slot-ace"]');
     if(!pane||!cluster) return {text:'',ellipsis:true,lastInsidePane:false,mode:null,partner:false,seam:false};
     const name=[...cluster.querySelectorAll('span')].find(el=>/alakaz/i.test(el.textContent||'')&&el.childElementCount===0);
     if(!name) return {text:'',ellipsis:true,lastInsidePane:false,mode:pane.getAttribute('data-showcase'),partner:!!pane.querySelector('[data-testid="slot-partner"]'),seam:!!pane.querySelector(':scope > svg line')};
     const raw=(name.textContent||'').replace(/\\s+/g,'');
     const cs=getComputedStyle(name);
     const node=[...name.childNodes].find(n=>n.nodeType===3);
     let lastInsidePane=false;
     if(node&&raw.length){
       const range=document.createRange();
       range.setStart(node, raw.length-1);
       range.setEnd(node, raw.length);
       const last=range.getBoundingClientRect();
       const pr=pane.getBoundingClientRect();
       lastInsidePane=last.width>0.5&&last.left>=pr.left-0.5&&last.right<=pr.right+0.5&&last.top>=pr.top-0.5&&last.bottom<=pr.bottom+0.5;
     }
     return {
       text: raw,
       ellipsis: cs.textOverflow==='ellipsis',
       lastInsidePane,
       mode: pane.getAttribute('data-showcase'),
       partner: !!pane.querySelector('[data-testid="slot-partner"]'),
       seam: !!pane.querySelector(':scope > svg line'),
     };`,
  );
  await s.screenshot(ctx.shot('gym-export-ace-name-inside-pane'));
  checks.push(ok(
    'gym-export:ace-name-inside-pane',
    aceName.text.toUpperCase() === 'ALAKAZAM' && !aceName.ellipsis && aceName.lastInsidePane
      && aceName.mode === 'split' && aceName.partner && aceName.seam,
    `text=${aceName.text} ellipsis=${aceName.ellipsis} lastInside=${aceName.lastInsidePane} mode=${aceName.mode} partner=${aceName.partner} seam=${aceName.seam}`,
  ));

  const STOMPING_LEAGUE = SABRINA_SOLO_LEAGUE.replace('tmMoveId:94', 'tmMoveId:707');
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${STOMPING_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:tm-two-word-wrap', status: 'skip', detail: 'league home never hydrated after Stomping Tantrum seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-tm"]', 40))) {
    checks.push({ name: 'gym-export:tm-two-word-wrap', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(800);
  const wrap = await s.evalJson<{
    text: string;
    ellipsis: boolean;
    lines: number;
    topGap: number;
    bottomGap: number;
    lastVisible: boolean;
  }>(
    `const slot=document.querySelector('[data-testid="slot-tm"]');
     const name=slot&&(slot.querySelector('[data-tm-name]')||[...slot.querySelectorAll('span')].find(el=>/stomping/i.test(el.textContent||'')&&el.childElementCount===0));
     const disc=slot&&slot.querySelector('svg[viewBox="0 0 24 24"] circle[r="9"]');
     const badge=slot&&slot.querySelector('svg[viewBox="0 0 200 40"]');
     const tm=slot&&slot.querySelector('[data-mark-label="tm"]');
     if(!slot||!name||!disc||!badge||!tm) return {text:'',ellipsis:true,lines:0,topGap:0,bottomGap:0,lastVisible:false};
     const cs=getComputedStyle(name);
     const lineH=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;
     const zoom=name.offsetHeight>0?name.getBoundingClientRect().height/name.offsetHeight:1;
     const node=[...name.childNodes].find(n=>n.nodeType===3);
     const tmNode=[...tm.childNodes].find(n=>n.nodeType===3);
     const inkBottom=(el,textNode)=>{
       if(!textNode||!(textNode.textContent||'').length) return el.getBoundingClientRect().bottom;
       const range=document.createRange();
       range.selectNodeContents(textNode);
       return range.getBoundingClientRect().bottom;
     };
     let lastVisible=false;
     if(node&&(node.textContent||'').length){
       const range=document.createRange();
       range.setStart(node,(node.textContent||'').length-1);
       range.setEnd(node,(node.textContent||'').length);
       const last=range.getBoundingClientRect();
       const sr=slot.getBoundingClientRect();
       lastVisible=last.width>0.5&&last.right<=sr.right+0.5&&last.bottom<=sr.bottom+0.5;
     }
     return {
       text:(name.textContent||'').replace(/\\s+/g,' ').trim(),
       ellipsis:cs.textOverflow==='ellipsis'||name.scrollWidth>name.clientWidth+1,
       lines:lineH>0?Math.round(name.offsetHeight/lineH):0,
       topGap:(badge.getBoundingClientRect().top-disc.getBoundingClientRect().top)/zoom,
       bottomGap:(inkBottom(tm,tmNode)-inkBottom(name,node))/zoom,
       lastVisible,
     };`,
  );
  await s.screenshot(ctx.shot('gym-export-tm-two-word-wrap'));
  checks.push(ok(
    'gym-export:tm-two-word-wrap',
    /stomping tantrum/i.test(wrap.text) && !wrap.ellipsis && wrap.lines === 2 && wrap.lastVisible
      && Math.abs(wrap.topGap - wrap.bottomGap) <= TM_GAP_SLACK,
    `text=${wrap.text} ellipsis=${wrap.ellipsis} lines=${wrap.lines} lastVisible=${wrap.lastVisible} top=${wrap.topGap.toFixed(1)} bottom=${wrap.bottomGap.toFixed(1)}`,
  ));

  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${SABRINA_SOLO_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:tm-one-word-line', status: 'skip', detail: 'league home never hydrated after Psychic seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-tm"]', 40))) {
    checks.push({ name: 'gym-export:tm-one-word-line', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(800);
  const oneLine = await s.evalJson<{ text: string; lines: number; topGap: number; bottomGap: number }>(
    `const slot=document.querySelector('[data-testid="slot-tm"]');
     const name=slot&&(slot.querySelector('[data-tm-name]')||[...slot.querySelectorAll('span')].find(el=>/psychic/i.test(el.textContent||'')&&el.childElementCount===0));
     const disc=slot&&slot.querySelector('svg[viewBox="0 0 24 24"] circle[r="9"]');
     const badge=slot&&slot.querySelector('svg[viewBox="0 0 200 40"]');
     const tm=slot&&slot.querySelector('[data-mark-label="tm"]');
     if(!slot||!name||!disc||!badge||!tm) return {text:'',lines:0,topGap:0,bottomGap:0};
     const cs=getComputedStyle(name);
     const lineH=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;
     const zoom=name.offsetHeight>0?name.getBoundingClientRect().height/name.offsetHeight:1;
     const tmNode=[...tm.childNodes].find(n=>n.nodeType===3);
     const nameNode=[...name.childNodes].find(n=>n.nodeType===3);
     const inkBottom=(el,textNode)=>{
       if(!textNode||!(textNode.textContent||'').length) return el.getBoundingClientRect().bottom;
       const range=document.createRange();
       range.selectNodeContents(textNode);
       return range.getBoundingClientRect().bottom;
     };
     return {
       text:(name.textContent||'').replace(/\\s+/g,' ').trim(),
       lines:lineH>0?Math.round(name.offsetHeight/lineH):0,
       topGap:(badge.getBoundingClientRect().top-disc.getBoundingClientRect().top)/zoom,
       bottomGap:(inkBottom(tm,tmNode)-inkBottom(name,nameNode))/zoom,
     };`,
  );
  await s.screenshot(ctx.shot('gym-export-tm-one-word-line'));
  checks.push(ok(
    'gym-export:tm-one-word-line',
    /^psychic$/i.test(oneLine.text) && oneLine.lines === 1 && Math.abs(oneLine.topGap - oneLine.bottomGap) <= TM_GAP_SLACK,
    `text=${oneLine.text} lines=${oneLine.lines} top=${oneLine.topGap.toFixed(1)} bottom=${oneLine.bottomGap.toFixed(1)}`,
  ));

  const BADGE_OVERFLOW_LEAGUE = SABRINA_SOLO_LEAGUE.replace("badgeName:'Marsh'", "badgeName:'Thunder Thunder Thunder'");
  await s.evalJson(`localStorage.setItem(${JSON.stringify(LEAGUE_KEY)}, ${BADGE_OVERFLOW_LEAGUE}); return true;`);
  await s.navigate(url);
  if (!(await waitLeagueHome(s))) {
    checks.push({ name: 'gym-export:badge-suffix-visible', status: 'skip', detail: 'league home never hydrated after badge overflow seed' });
    return checks;
  }
  await s.click('[data-testid="league-slot-0"]');
  if (!(await waitFor(s, '[data-testid="slot-badge"]', 40))) {
    checks.push({ name: 'gym-export:badge-suffix-visible', status: 'fail', detail: 'trainer card never opened' });
    return checks;
  }
  await sleep(800);
  const badgeFit = await s.evalJson<{ rendered: string; suffixVisible: boolean; overflows: boolean }>(
    `const field=document.querySelector('[aria-label="Badge name"]');
     const suffix=document.querySelector('[data-badge-suffix]');
     const box=field&&field.parentElement;
     if(!field||!box) return {rendered:'',suffixVisible:false,overflows:true};
     const br=box.getBoundingClientRect();
     const rects=suffix?[...suffix.getClientRects()]:[];
     const suffixVisible=!!suffix&&rects.length>0&&rects.every(r=>r.width<0.5||(r.left>=br.left-1&&r.right<=br.right+1&&r.top>=br.top-1&&r.bottom<=br.bottom+1));
     return {rendered:(field.textContent||'').replace(/\\u00a0/g,' '),suffixVisible,overflows:box.scrollHeight>box.clientHeight+1};`,
  );
  await s.screenshot(ctx.shot('gym-export-badge-suffix-visible'));
  checks.push(ok(
    'gym-export:badge-suffix-visible',
    /Badge/.test(badgeFit.rendered) && !/Thunder Thunder Thunder/.test(badgeFit.rendered)
      && badgeFit.suffixVisible && !badgeFit.overflows,
    `rendered=${badgeFit.rendered} suffixVisible=${badgeFit.suffixVisible} overflows=${badgeFit.overflows}`,
  ));
  return checks;
}

const FIVE_LINE_LEAGUE =
  "(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const line=(id)=>({branch:[id],boundaries:[1]});const cards=Array.from({length:14},empty);cards[0]={...empty(),lines:[line(1),line(4),line(7),line(10),line(16)]};return JSON.stringify({state:{name:'',cards,celebratedNudges:[]},version:2});})()";

const SEVEN_GYMS_LEAGUE =
  "(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const line=(id)=>({branch:[id],boundaries:[1]});const cards=Array.from({length:14},empty);for(let i=0;i<7;i++)cards[i]={...empty(),lines:[line(i+1)]};return JSON.stringify({state:{name:'',cards,celebratedNudges:[]},version:2});})()";

/** Every card but Elite Four 1 filled, after the eight-gym popup was seen. */
const LAST_CARD_EMPTY_LEAGUE =
  "(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const line=(id)=>({branch:[id],boundaries:[1],boundaryMode:'auto'});const cards=Array.from({length:14},empty);for(let i=0;i<14;i++)if(i!==8)cards[i]={...empty(),lines:[line(i+1)]};return JSON.stringify({state:{name:'',cards,celebratedNudges:['league']},version:3});})()";

/** A full v3 league that saw the eight-gym popup, which said "League ready" before v4. */
const FULL_SEEN_V3_LEAGUE =
  "(()=>{const empty=()=>({type:null,theme:'',lines:[],signatureSeat:null,tmMoveId:null,badgeName:'',legend:null,powerup:null});const line=(id)=>({branch:[id],boundaries:[1],boundaryMode:'auto'});const cards=Array.from({length:14},(_,i)=>({...empty(),lines:[line(i+1)]}));return JSON.stringify({state:{name:'',cards,celebratedNudges:['league']},version:3});})()";

async function waitNudge(s: Session, kind: 'card' | 'league' | 'complete'): Promise<boolean> {
  return waitFor(s, `[data-testid="league-nudge"][data-league-nudge="${kind}"]`, 25);
}

async function closeLeagueCard(s: Session): Promise<void> {
  const collapsed = await s.evalJson<boolean>(`const b=document.querySelector('[aria-label="Collapse the trainer card"]')||document.querySelector('[aria-label^="Back to the league"]'); if(!b) return false; b.click(); return true;`).catch(() => false);
  if (collapsed) await sleep(800);
  await waitFor(s, '[data-testid="league-slot-0"]');
}

/** Seat the current picker result. Native click, then close the desktop pane. */
async function placePickerLine(s: Session): Promise<boolean> {
  const clicked = await s.evalJson<boolean>(`const el=document.querySelector(${JSON.stringify(PLACE_CARD)}); if(!el) return false; el.click(); return true;`).catch(() => false);
  await sleep(600);
  await s.evalJson(`const b=document.querySelector('[data-testid="browser-close"]'); if(b) b.click(); return true;`).catch(() => false);
  await sleep(400);
  return clicked;
}

export async function runLeagueFunnelNudgeSuite(s: Session, _persona: PersonaName | null, ctx: FlowContext): Promise<Check[]> {
  const checks: Check[] = [];
  const url = ctx.base + LEAGUE_PATH;

  if (!(await seedLeagueHome(s, url, FIVE_LINE_LEAGUE))) {
    checks.push({ name: 'league-funnel:card-nudge-shown', status: 'skip', detail: 'league home never hydrated' });
    checks.push({ name: 'league-funnel:roster-nudge-shown', status: 'skip', detail: 'league home never hydrated' });
    return checks;
  }

  const cardOpen = await openLeagueCard(s, 0);
  if (!cardOpen) {
    checks.push(ok('league-funnel:card-nudge-shown', false, 'card never opened'));
  } else {
    await s.click('[data-testid="card-cell-11-6"]');
    await waitFor(s, '[data-filter-chip="my-dex"]');
    await sleep(600);
    await searchPicker(s, 'eevee');
    await placePickerLine(s);
    const shown = await waitNudge(s, 'card');
    await s.screenshot(ctx.shot('league-funnel-card-nudge'));
    checks.push(ok('league-funnel:card-nudge-shown', shown, shown ? 'card export nudge' : 'no [data-testid=league-nudge] after sixth line'));
  }

  if (!(await seedLeagueHome(s, url, SEVEN_GYMS_LEAGUE))) {
    checks.push({ name: 'league-funnel:roster-nudge-shown', status: 'skip', detail: 'league home never hydrated for roster' });
    return checks;
  }
  if (!(await openLeagueCard(s, 7))) {
    checks.push(ok('league-funnel:roster-nudge-shown', false, 'gym 8 never opened'));
    return checks;
  }
  await s.click('[data-testid="card-cell-1-1"]');
  await waitFor(s, '[data-filter-chip="my-dex"]');
  await sleep(600);
  await searchPicker(s, 'pikachu');
  await placePickerLine(s);
  await closeLeagueCard(s);
  const roster = await waitNudge(s, 'league');
  await s.screenshot(ctx.shot('league-funnel-roster-nudge'));
  checks.push(ok('league-funnel:roster-nudge-shown', roster, roster ? 'league export nudge' : 'no roster nudge after 8 gyms'));
  if (roster) {
    // The popup sits under or beside the summary, never over a row, and the
    // league Export button pulses while it shows.
    const geo = await s.evalJson<{ covered: number[]; pulse: boolean; placement: string | null }>(
      `const n=document.querySelector('[data-testid="league-nudge"]').getBoundingClientRect();
       const covered=[];for(let i=0;i<14;i++){const r=document.querySelector('[data-testid="league-slot-'+i+'"]').getBoundingClientRect();
       if(Math.min(r.right,n.right)-Math.max(r.left,n.left)>0.5&&Math.min(r.bottom,n.bottom)-Math.max(r.top,n.top)>0.5)covered.push(i+1);}
       const b=document.querySelector('[data-league-export="league"]');
       return {covered,pulse:!!b&&b.hasAttribute('data-nudge-pulse'),placement:document.querySelector('[data-testid="league-nudge"]').getAttribute('data-nudge-placement')};`,
    ).catch(() => ({ covered: [-1], pulse: false, placement: null }));
    checks.push(ok(
      'league-funnel:roster-nudge-clear-of-rows',
      geo.covered.length === 0 && geo.pulse,
      `covered rows=[${geo.covered.join(',')}] export pulse=${geo.pulse} placement=${geo.placement}`,
    ));
  } else {
    checks.push(ok('league-funnel:roster-nudge-clear-of-rows', false, 'roster nudge never shown'));
  }

  if (!(await seedLeagueHome(s, url, FULL_SEEN_V3_LEAGUE))) {
    checks.push({ name: 'league-funnel:full-save-skips-seen-popup', status: 'skip', detail: 'league home never hydrated for the full save' });
  } else {
    await sleep(1500);
    const saved = await s.evalJson<{ version: number | null; celebrated: string[]; nudges: number }>(
      `const r=JSON.parse(localStorage.getItem(${JSON.stringify(LEAGUE_KEY)})||'{}');return {version:r.version??null,celebrated:r.state?.celebratedNudges??[],nudges:document.querySelectorAll('[data-testid="league-nudge"]').length};`,
    ).catch(() => ({ version: null, celebrated: [] as string[], nudges: -1 }));
    await s.screenshot(ctx.shot('league-funnel-full-save'));
    // v4 records the seen popup; later save versions must keep it suppressed.
    checks.push(ok(
      'league-funnel:full-save-skips-seen-popup',
      saved.nudges === 0 && saved.version !== null && saved.version >= 4 && saved.celebrated.includes('complete'),
      `nudges=${saved.nudges} version=${saved.version} celebrated=${saved.celebrated.join(',')}`,
    ));
  }

  if (!(await seedLeagueHome(s, url, LAST_CARD_EMPTY_LEAGUE))) {
    checks.push({ name: 'league-funnel:complete-nudge-shown', status: 'skip', detail: 'league home never hydrated for the last card' });
    return checks;
  }
  if (!(await openLeagueCard(s, 8))) {
    checks.push(ok('league-funnel:complete-nudge-shown', false, 'Elite Four 1 never opened'));
    return checks;
  }
  await s.click('[data-testid="card-cell-1-1"]');
  await waitFor(s, '[data-filter-chip="my-dex"]');
  await sleep(600);
  await searchPicker(s, 'eevee');
  await placePickerLine(s);
  await closeLeagueCard(s);
  const complete = await waitNudge(s, 'complete');
  await s.screenshot(ctx.shot('league-funnel-complete-nudge'));
  checks.push(ok('league-funnel:complete-nudge-shown', complete, complete ? 'full league export nudge' : 'no complete nudge after the last card'));
  return checks;
}
