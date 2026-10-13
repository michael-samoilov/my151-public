import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installOptOut, isOptedOut } from '../lib/clientId'
import { installStaleDeployReload } from '../lib/staleDeploy'
import { installHideBrokenImages } from '../lib/hideBrokenImages'
import { whenIdle } from '../lib/whenIdle'
import './pickerNames'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'
import { FavoritesApp } from './FavoritesApp'

const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

installLayoutFontSize();
installOptOut();
installHideBrokenImages()
installStaleDeployReload();

if (!isOptedOut()) {
  whenIdle(() => {
    void import('@vercel/analytics').then((m) => m.inject());
    void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights());
  });
}

// A first visit starts this code after the first paint (vite.config.ts), which
// can be after `load` has fired.
if ('serviceWorker' in navigator) {
  const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}

const rootEl = document.getElementById('root')!;

void initLocale({
  search: window.location.search,
  stored: usePokedexStore.getState().locale,
  navigatorLanguages: navigator.languages,
}).finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <FavoritesApp />
    </StrictMode>,
  )
})
