import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'
import { installLayoutFontSize } from './lib/layoutFontSize'

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
type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};
function whenIdle(cb: () => void) {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(cb, { timeout: 3000 });
  } else {
    setTimeout(cb, 1500);
  }
}
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
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
