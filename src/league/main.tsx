import './formNames'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installTranslationGuard } from '../lib/translationGuard'
import { installOptOut, isOptedOut } from '../lib/clientId'
import { installStaleDeployReload } from '../lib/staleDeploy'
import { installHideBrokenImages } from '../lib/hideBrokenImages'
import { whenIdle } from '../lib/whenIdle'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'
import { LeagueApp } from './LeagueApp'
import { activeMoveNames } from './moveNames'

const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

// platform: iOS Safari zooms into focused inputs under 16px and ignores maximum-scale for pinch. Android honours the cap for pinch, so only iOS gets it.
const isIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIos) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

installLayoutFontSize();
installTranslationGuard();
installOptOut();
installHideBrokenImages()
installStaleDeployReload();

if (!isOptedOut()) {
  whenIdle(() => {
    void import('@vercel/analytics').then((m) => m.inject());
    void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights());
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const rootEl = document.getElementById('root')!;

void initLocale({
  search: window.location.search,
  stored: usePokedexStore.getState().locale,
  navigatorLanguages: navigator.languages,
})
  .then(() => Promise.race([activeMoveNames(), new Promise((resolve) => setTimeout(resolve, 800))]))
  .finally(() => {
    createRoot(rootEl).render(
      <StrictMode>
        <LeagueApp />
      </StrictMode>,
    )
  })
