import '../lib/resizeObserverFallback'
import { StrictMode, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installTranslationGuard } from '../lib/translationGuard'
import { installOptOut } from '../lib/clientId'
import { installVisitCounting } from '../lib/visitCounting'
import { installStaleDeployReload } from '../lib/staleDeploy'
import { installHideBrokenImages } from '../lib/hideBrokenImages'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'

const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

void Promise.all([400, 700, 800].map(weight =>
  document.fonts.load(`${weight} 16px "Inter Variable"`, 'my151.app Pokédex 0123456789')
    .then(faces => {
      if (!faces.length || faces.some(face => face.status !== 'loaded')) throw new Error('Inter is unavailable');
    }),
)).then(() => {
  document.documentElement.classList.remove('p151-hub-inter-initial', 'p151-hub-font-pending', 'p151-hub-font-failed');
}).catch(() => {
});

installLayoutFontSize();
installTranslationGuard();
installOptOut();
installHideBrokenImages()
installStaleDeployReload();

installVisitCounting();

if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

const rootEl = document.getElementById('root')!;

const waiting = document.documentElement.classList.contains('p151-wait');
const prerendered = rootEl.hasAttribute('data-prerendered') && !waiting;

function mount(app: ReactNode) {
  flushSync(() => createRoot(rootEl).render(app));
  const artworkReady = rootEl.querySelector('.hub-grid') ? window.p151HomeArtwork?.refresh() : undefined;
  void (artworkReady ?? Promise.resolve()).then(() => {
    document.documentElement.classList.remove('p151-wait');
  });
}

function finishHubMount() {
  const html = document.documentElement;
  const ready = () => !html.classList.contains('p151-wait') && !html.classList.contains('p151-hub-images-pending')
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
      document.documentElement.classList.add('p151-hub-hydrating');
      hydrateRoot(rootEl, app);
    } else {
      mount(app);
    }
    finishHubMount();
  });
}
