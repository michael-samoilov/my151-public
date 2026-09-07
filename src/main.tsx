import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { installLayoutFontSize } from './lib/layoutFontSize'
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

// Defer Vercel Analytics + Speed Insights so they don't block first paint or INP.
whenIdle(() => {
  void import('@vercel/analytics').then((m) => m.inject());
  void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights());
});

// Register service worker for offline sprite caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const rootEl = document.getElementById('root')!;

// Admin-only submissions view, reached at `?admin`. Code-split so the normal
// app bundle never pulls it in.
if (new URLSearchParams(window.location.search).has('admin')) {
  void import('./components/admin/AdminPage').then(({ AdminPage }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <AdminPage />
      </StrictMode>,
    );
  });
} else if (new URLSearchParams(window.location.search).has('home')) {
  // The router page, in review. It is deliberately reachable only by this flag:
  // it has no URL of its own, so nothing links to it and no crawler finds it,
  // and the tool slugs it points at do not exist yet. The `noindex` below is
  // the belt to that braces. Give it a real route only when the tools it
  // routes to are ready — see docs/future-tools/home-page/.
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);
  void Promise.all([
    import('./components/home/HomePage'),
    initLocale({
      search: window.location.search,
      stored: usePokedexStore.getState().locale,
      navigatorLanguages: navigator.languages,
    }),
  ]).then(([{ HomePage }]) => {
    createRoot(rootEl).render(
      <StrictMode>
        <HomePage />
      </StrictMode>,
    );
  });
} else {
  // Resolve the display language before the first paint. English is bundled, so
  // the common path resolves synchronously; anything else is raced against a
  // timeout inside initLocale so a stalled catalog degrades to English instead
  // of holding the boot spinner open. That spinner (in index.html) already
  // covers this window.
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
}
