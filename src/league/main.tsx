import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { installOptOut } from '../lib/clientId'
import { whenIdle } from '../lib/whenIdle'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'
import { LeagueApp } from './LeagueApp'

// Same boot as the dex builder (src/main.tsx): preload the Latin subset,
// install the JS-driven root font-size, defer analytics, register the
// sprite-caching service worker.
const preload = document.createElement('link');
preload.rel = 'preload';
preload.as = 'font';
preload.type = 'font/woff2';
preload.crossOrigin = 'anonymous';
preload.href = interLatinUrl;
document.head.prepend(preload);

// iOS Safari zooms the page into any focused input whose font-size is
// under 16px. Capping maximum-scale suppresses that auto-zoom, while
// Safari (since iOS 10) ignores the cap for user pinch gestures, so pinch
// zoom keeps working. iOS-scoped on purpose: Android Chrome honours the
// cap for pinch — an accessibility loss — and never auto-zooms focused
// inputs under a width=device-width viewport anyway.
const isIos =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIos) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

installLayoutFontSize();
// `?notme` marks this browser as the owner's, out of analytics.
installOptOut();

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

void initLocale({
  search: window.location.search,
  stored: usePokedexStore.getState().locale,
  navigatorLanguages: navigator.languages,
}).finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <LeagueApp />
    </StrictMode>,
  )
})
