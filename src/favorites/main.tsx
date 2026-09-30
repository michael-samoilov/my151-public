import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installOptOut, isOptedOut } from '../lib/clientId'
import { whenIdle } from '../lib/whenIdle'
import './pickerNames'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'
import { FavoritesApp } from './FavoritesApp'
import { SpriteChecklist } from './components/SpriteChecklist'
import { SPRITE_CHECK_ENABLED } from './model/spriteChecklist'

const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

installLayoutFontSize();
installOptOut();

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
}).then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      {SPRITE_CHECK_ENABLED ? <SpriteChecklist /> : <FavoritesApp />}
    </StrictMode>,
  )
})
