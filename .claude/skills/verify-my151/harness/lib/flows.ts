// Standard-surface invariants every change re-checks, driven through the Session
// interface so one flow runs on all three engines. Handles are structural
// (data-nav, computed style, the localStorage oracle), never localized text.
import type { Session } from './engines.ts';
import { READ_PERSONA, assertPersona, type PersonaReadback, type PersonaName } from './personas.ts';
import type { Check } from './evidence.ts';

// Source of truth: src/lib/demoMode.ts POKEDEX_STORAGE_KEY (local build) and
// src/store/usePokedexStore.ts persist version.
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
    await s.navigate(base);
    await waitForApp(s);
    await waitForStoreKey(s);
    await writeSeedUntilStable(s);
    await s.navigate(base);
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
  await s.navigate(ctx.base);
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

  // Grid renders the seeded dex (sprite images present).
  const sprites = await s.evalJson<number>(`return document.querySelectorAll('img').length;`);
  checks.push(ok('builder:sprites-rendered', sprites >= 10, `img count ${sprites}`));
  await s.screenshot(ctx.shot('builder-seeded'));

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
    await s.screenshot(ctx.shot(`nav-${nav}`));
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

// ---------------------------------------------------------------------------
// League builder page (/pokemon-league-builder), added 2026-08-29. Checks are
// the invariants that change introduced: the page boots on its own entry, the
// served HTML carries the static SEO content, layout holds, a real drive
// writes the league's own store key, and the run stays error-free. The drive
// runs on desktop-width Blink (the instant-add path); other surfaces prove
// boot, layout, and rendering.
const LEAGUE_PATH = '/pokemon-league-builder';
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
    checks.push(ok('league:static-seo-content', res.ok && hasH1 && hasTitle, `status ${res.status}, h1=${hasH1}, title=${hasTitle}`));
    // A build without the page serves the SPA fallback (the dex HTML, status
    // 200), so absence is the content mismatch, not the status. Nothing else
    // applies then — driving the dex page against league handles would only
    // error the surface.
    if (!res.ok || !hasH1 || !hasTitle) return checks;
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
    const dexBefore = await readSeedCount(s);
    await s.click(`[data-testid="league-slot-${CARD}"]`);
    await sleep(400);
    await s.click('[aria-label="Gym type"]');
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
