declare const __DEPLOY_ENV__: string;

const DEPLOY_ENV: string = (() => {
  try {
    return typeof __DEPLOY_ENV__ !== 'undefined' ? __DEPLOY_ENV__ : '';
  } catch {
    return '';
  }
})();

export const PREVIEW_FEATURES: boolean = (() => {
  try {
    return DEPLOY_ENV === 'preview' || import.meta.env.DEV === true;
  } catch {
    return false;
  }
})();

export const PRODUCTION_DEPLOY: boolean = DEPLOY_ENV === 'production';

export const PREVIEW_DEPLOY: boolean = DEPLOY_ENV === 'preview';

export const SPANDREL_DEMO: boolean = (() => {
  try {
    const env = typeof __DEPLOY_ENV__ !== 'undefined' ? __DEPLOY_ENV__ : '';
    if (env === 'production') return false;
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === 'spandrels'
    );
  } catch {
    return false;
  }
})();

export const DEMO_MODE: boolean = (() => {
  try {
    const env = typeof __DEPLOY_ENV__ !== 'undefined' ? __DEPLOY_ENV__ : '';
    if (env === 'production') return false;
    if (SPANDREL_DEMO) return true;
    if (env === 'preview') return true;
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '151'
    );
  } catch {
    return false;
  }
})();

export const POKEDEX_STORAGE_KEY = SPANDREL_DEMO
  ? 'personal-151-pokedex-spandrel-demo'
  : DEMO_MODE
    ? 'personal-151-pokedex-demo'
    : 'personal-151-pokedex-v3';
