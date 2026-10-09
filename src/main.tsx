import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { installLayoutFontSize } from './lib/layoutFontSize'
import { installOptOut, isOptedOut } from './lib/clientId'
import { installStaleDeployReload } from './lib/staleDeploy'
import { whenIdle } from './lib/whenIdle';
import { initLocale } from './i18n/bootstrap'
import { usePokedexStore } from './store/usePokedexStore'

// Preload the Latin variable-weight subset (the only one actually rendered for the UI copy) so
// the font arrives alongside the JS instead of after it, trimming FCP/LCP on first paint.
const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

// JS-driven root font-size. Replaces the CSS `font-size: clamp(…vw…)` rule
// that used to live in index.css — CSS vw is tied to iOS's visual viewport,
// causing chrome to shrink during pinch-zoom. See lib/layoutFontSize.ts.
installLayoutFontSize();
// `?notme` marks this browser as the owner's, out of analytics.
installOptOut();
installStaleDeployReload();

// Vercel's own page-view counting obeys the same opt-out as our beacons. It is
// a separate system with a separate dashboard, so leaving it ungated meant
// `?notme` silenced our numbers while the owner kept showing up as a Vercel
// visitor — the one place the exclusion was expected to hold.
if (!isOptedOut()) {
  // Deferred so they don't block first paint or INP.
  whenIdle(() => {
    void import('@vercel/analytics').then((m) => m.inject());
    void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights());
  });
}

// Register service worker for offline sprite caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const rootEl = document.getElementById('root')!;

// Resolve the display language before the first paint. English is bundled, so
// the common path resolves synchronously; anything else is raced against a
// timeout inside initLocale so a stalled catalog degrades to English instead
// of holding the boot spinner open. That spinner (in pokedex-builder.html)
// already covers this window.
void initLocale({
  search: window.location.search,
  stored: usePokedexStore.getState().locale,
  navigatorLanguages: navigator.languages,
}).finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
