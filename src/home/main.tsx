import { StrictMode, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installOptOut, isOptedOut } from '../lib/clientId'
import { installStaleDeployReload } from '../lib/staleDeploy'
import { installHideBrokenImages } from '../lib/hideBrokenImages'
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

// Keep the initial Inter face until the complete font can render new UI text.
void Promise.all([400, 700, 800].map(weight =>
  document.fonts.load(`${weight} 16px "Inter Variable"`, 'my151.app Pokédex 0123456789')
    .then(faces => {
      if (!faces.length || faces.some(face => face.status !== 'loaded')) throw new Error('Inter is unavailable');
    }),
)).then(() => {
  document.documentElement.classList.remove('p151-hub-inter-initial', 'p151-hub-font-pending', 'p151-hub-font-failed');
}).catch(() => {
  // The initial Inter remains usable if the full font request fails.
});

installLayoutFontSize();
// `?notme` marks this browser as the owner's, out of analytics.
installOptOut();
installHideBrokenImages()
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

if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  };
  // Image-first startup can execute this entry after the load event.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

const rootEl = document.getElementById('root')!;

// The build writes the English hub into #root (scripts/prerender-hub.ts). Its
// head script adds `p151-wait` for a visitor who will not get that page, such
// as one in another language; for them #root stays hidden behind the spinner.
const waiting = document.documentElement.classList.contains('p151-wait');
const prerendered = rootEl.hasAttribute('data-prerendered') && !waiting;

/** Renders into #root from scratch, then lets the view's readiness gate reveal it. */
function mount(app: ReactNode) {
  flushSync(() => createRoot(rootEl).render(app));
  document.documentElement.classList.remove('p151-wait');
}

/** Early header input can hydrate the hub before its screenshots are ready. */
function finishHubMount() {
  const html = document.documentElement;
  const ready = () => !html.classList.contains('p151-hub-images-pending')
    && !html.classList.contains('p151-hub-font-pending');
  if (ready()) {
    document.querySelector('.p151-boot')?.remove();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!ready()) return;
    document.querySelector('.p151-boot')?.remove();
    observer.disconnect();
  });
  observer.observe(html, { attributes: true, attributeFilter: ['class'] });
}

// Admin-only submissions view, reached at `/?admin`. It lives on the root
// entry because that is the URL the owner has always used. Code-split so the
// hub bundle never pulls it in.
if (new URLSearchParams(window.location.search).has('admin')) {
  void import('../components/admin/AdminPage').then(({ AdminPage }) => {
    mount(
      <StrictMode>
        <AdminPage />
      </StrictMode>,
    );
    document.querySelector('.p151-boot')?.remove();
  });
} else {
  const localeReady = initLocale({
    search: window.location.search,
    stored: usePokedexStore.getState().locale,
    navigatorLanguages: navigator.languages,
  });
  // The English prerender displays no Pokémon names. Attach its handlers
  // without waiting for that data, which still loads for the language picker.
  void Promise.all([
    import('../components/home/HomePage'),
    prerendered ? undefined : localeReady,
  ]).then(([{ HomePage }]) => {
    const app = (
      <StrictMode>
        <HomePage />
      </StrictMode>
    );
    if (prerendered) {
      hydrateRoot(rootEl, app);
    } else {
      mount(app);
    }
    finishHubMount();
  });
}
