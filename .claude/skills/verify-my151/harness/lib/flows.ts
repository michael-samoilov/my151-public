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

// Write the seed after the app's own initial persist write, then reload so it
// rehydrates from the seed.
export async function seedDex(s: Session, base: string): Promise<void> {
  await s.navigate(base);
  await waitForApp(s);
  await waitForStoreKey(s);
  await s.evalJson(`localStorage.setItem(${JSON.stringify(STORE_KEY)}, ${JSON.stringify(seedValue(SEED_SECTIONS))}); return true;`);
  await s.navigate(base);
  await waitForApp(s);
  await waitForStoreKey(s);
}

// Which view is active, read from the nav button's variant class. The active tab
// uses the "default" Button variant, whose class carries the token "bg-primary"
// (src/components/ui/button.tsx); ghosts do not. Engine-portable, free of
// localized text, and free of regex backslashes (a template literal drops them).
const ACTIVE_VIEW = `
const btns = [...document.querySelectorAll('[data-nav]')];
const active = btns.filter(b => b.className.split(' ').indexOf('bg-primary') >= 0).map(b => b.getAttribute('data-nav'));
return { active, navs: btns.map(b => b.getAttribute('data-nav')) };
`;

async function activeView(s: Session): Promise<{ active: string[]; navs: string[] }> {
  return s.evalJson(ACTIVE_VIEW);
}

// No horizontal page scroll, and the document painted a non-trivial area.
const LAYOUT = `
const de = document.documentElement;
return { scrollWidth: de.scrollWidth, innerWidth: window.innerWidth, bodyH: document.body.getBoundingClientRect().height };
`;

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

  // Navigate each tab and confirm exactly it becomes active.
  for (const nav of ['view', 'analytics', 'builder'] as const) {
    await s.click(`[data-nav="${nav}"]`);
    await new Promise((r) => setTimeout(r, 400));
    const view = await activeView(s);
    checks.push(ok(`nav:${nav}-active`, view.active.length === 1 && view.active[0] === nav, `active=[${view.active.join(',')}]`));
    await s.screenshot(ctx.shot(`nav-${nav}`));
  }

  // Scroll the builder container: setting the offset must take (proves it scrolls).
  await s.click('[data-nav="builder"]');
  await new Promise((r) => setTimeout(r, 300));
  const scrolled = await s.evalJson<{ before: number; after: number; found: boolean }>(
    `const el=document.querySelector('[data-build-scroll]'); if(!el) return {before:0,after:0,found:false}; const before=el.scrollTop; el.scrollTop=before+300; return {before, after:el.scrollTop, found:true};`,
  );
  checks.push(ok('scroll:builder-container', scrolled.found && scrolled.after > scrolled.before, `top ${scrolled.before}->${scrolled.after}`));

  return checks;
}
