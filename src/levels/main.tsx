import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '../index.css'
import { installLayoutFontSize } from '../lib/layoutFontSize'
import { initLocale } from '../i18n/bootstrap'
import { usePokedexStore } from '../store/usePokedexStore'
import { PRODUCTION_DEPLOY } from '../lib/demoMode'
import { LevelsPage } from './LevelsPage'

const rootEl = document.getElementById('root')!;

installLayoutFontSize();

void initLocale({
  search: window.location.search,
  stored: usePokedexStore.getState().locale,
  navigatorLanguages: navigator.languages,
}).finally(() => {
createRoot(rootEl).render(
  <StrictMode>
    {PRODUCTION_DEPLOY ? (
      <div style={{ maxWidth: '32rem', margin: '3rem auto', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>Not available here</h1>
        <p style={{ color: '#525252', lineHeight: 1.5, margin: 0 }}>
          This page is a build diagnostic for the Pokémon League Builder. It runs
          on preview deployments only. <a href="/">Back to my151</a>.
        </p>
      </div>
    ) : (
      <LevelsPage />
    )}
  </StrictMode>,
)
});
