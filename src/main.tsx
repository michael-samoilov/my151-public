import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject as injectAnalytics } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import './index.css'
import App from './App.tsx'
import { installLayoutFontSize } from './lib/layoutFontSize'

// JS-driven root font-size. Replaces the CSS `font-size: clamp(…vw…)` rule
// that used to live in index.css — CSS vw is tied to iOS's visual viewport,
// causing chrome to shrink during pinch-zoom. See lib/layoutFontSize.ts.
installLayoutFontSize();

// Vercel Analytics & Speed Insights
injectAnalytics();
injectSpeedInsights();

// Register service worker for offline sprite caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
