import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { direction, htmlLang, type Locale } from './config';
import { getLocale, getVersion, subscribe, translate, translatePlural } from './core';
import type { TFn, TnFn, PluralBase } from './types';

/**
 * Subscribes to the locale store in core.ts. There is no React context: the
 * store already exists outside the tree (the canvas exporters read it), so a
 * context would be a second source of truth for the same value.
 */
export function useLocale(): Locale {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return getLocale();
}

/** `t('nav.build')`, `t('nav.analyticsUnlockTip', { count: 25 })`. */
export function useT(): TFn {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  // `translate` already carries the strict argument typing; the hook exists to
  // re-render on locale change, not to add anything to the call signature.
  return translate;
}

/** Counted messages: `tn('browser.results', n)`. */
export function useTn(): TnFn {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return useCallback(
    (base: PluralBase, count: number, args?: Record<string, string | number>) =>
      translatePlural(base, count, args),
    [],
  );
}

/**
 * Keeps `<html lang>`/`dir` in step with the active locale. Both matter beyond
 * cosmetics: `lang` drives the per-script font stacks and tells a screen reader
 * which voice to use, and it is what CSS `:lang()` selectors key off.
 */
export function useDocumentLocale(): void {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.documentElement.dir = direction(locale);
  }, [locale]);
}
