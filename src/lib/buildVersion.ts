declare const __BUILD_TIMESTAMP__: string;

export const BUILD_TIMESTAMP: string = import.meta.env.SSR
  ? __BUILD_TIMESTAMP__
  : typeof document === 'undefined'
    ? ''
    : document.querySelector('meta[name="p151-build"]')?.getAttribute('content') ?? '';
