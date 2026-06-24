// Demo-seed mode. When active, the View page is pre-populated with a sample dex
// (src/data/demoDex.ts) so the section-outline work can be reviewed against a
// full 151. It is deliberately fenced off from real users:
//
//   • Activation is opt-in only — an explicit `?demo=151` URL flag, or a Vercel
//     *preview* deployment (never production). Wrapped in try/catch so any error
//     falls back to "off".
//   • The store persists under a separate localStorage key in this mode, so a
//     real user's saved dex is never read or overwritten.
//   • All analytics beacons are suppressed, so demo activity never reaches the
//     admin dashboard stats.
//
// __DEPLOY_ENV__ is injected at build time from Vercel's VERCEL_ENV (see
// vite.config.ts); it is '' locally and on non-Vercel builds.
declare const __DEPLOY_ENV__: string;

const DEPLOY_ENV: string = (() => {
  try {
    return typeof __DEPLOY_ENV__ !== 'undefined' ? __DEPLOY_ENV__ : '';
  } catch {
    return '';
  }
})();

/** Whether unfinished, preview-only features (the View-page build-section
 *  outlines) are available. Opt-IN: only an explicit Vercel preview deployment
 *  or local dev turns them on. Any other environment — production, or a build
 *  where VERCEL_ENV is missing/unexpected — leaves them off, so there is no path
 *  for them to reach the live site. */
export const PREVIEW_FEATURES: boolean = (() => {
  try {
    return DEPLOY_ENV === 'preview' || import.meta.env.DEV === true;
  } catch {
    return false;
  }
})();

export const DEMO_MODE: boolean = (() => {
  try {
    const env = typeof __DEPLOY_ENV__ !== 'undefined' ? __DEPLOY_ENV__ : '';
    // Hard stop on production: the flag is ignored there, so there is no way for
    // a real user to trigger the demo dex on the live site.
    if (env === 'production') return false;
    // Auto-on for Vercel preview deployments.
    if (env === 'preview') return true;
    // Otherwise (preview/local) honour an explicit opt-in flag.
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '151'
    );
  } catch {
    return false;
  }
})();

/** localStorage key for the persisted dex — a separate, throwaway key in demo
 *  mode so real saved data is never touched. */
export const POKEDEX_STORAGE_KEY = DEMO_MODE
  ? 'personal-151-pokedex-demo'
  : 'personal-151-pokedex-v3';
