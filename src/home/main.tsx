import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { whenIdle } from '../lib/whenIdle'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'

// The hub's entry, served at `/`. Same boot as the dex builder (src/main.tsx):
// preload the Latin subset, install the JS-driven root font-size, defer
// analytics, register the sprite-caching service worker.
const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

installLayoutFontSize();

whenIdle(() => {
  void import('@vercel/analytics').then((m) => m.inject());
  void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights());
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const rootEl = document.getElementById('root')!;

// Admin-only submissions view, reached at `/?admin`. It lives on the root
// entry because that is the URL the owner has always used. Code-split so the
// hub bundle never pulls it in.
if (new URLSearchParams(window.location.search).has('admin')) {
  void import('../components/admin/AdminPage').then(({ AdminPage }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <AdminPage />
      </StrictMode>,
    );
  });
} else {
  void Promise.all([
    import('../components/home/HomePage'),
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
}
