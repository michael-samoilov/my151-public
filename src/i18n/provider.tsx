import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { direction, htmlLang, type Locale } from './config';
import { getLocale, getVersion, subscribe, translate, translatePlural } from './core';
import { getNamesVersion, subscribeNames } from './names';
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

/**
 * `t('nav.build')`, `t('nav.analyticsUnlockTip', { count: 25 })`.
 *
 * The returned function's identity deliberately changes with the locale. It
 * would be cheaper to hand back the stable module-level `translate`, but then
 * any `useMemo` that builds labels would keep its stale English result after a
 * locale switch — listing `t` in the dependency array would do nothing, because
 * `t` never changed. Re-identifying per locale makes the exhaustive-deps rule
 * point at exactly the right dependency.
 */
export function useT(): TFn {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    // The memo is keyed on `version` deliberately, and the body has to read it
    // for exhaustive-deps to agree that the dependency is real.
    void version;
    return ((key, ...args) => translate(key, ...args)) as TFn;
  }, [version]);
}

/** Counted messages: `tn('browser.results', n)`. Same identity rule as useT. */
export function useTn(): TnFn {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    void version;
    return (base: PluralBase, count: number, args?: Record<string, string | number>) =>
      translatePlural(base, count, args);
  }, [version]);
}

/**
 * Ticks when the rendered *names* could have changed — a locale switch, or a
 * name catalog finishing its download some frames after the locale did.
 *
 * Separate from `useLocale` because the names are a second, later-arriving
 * source: a component that reads only `useLocale` re-renders on the switch,
 * finds the catalog still loading, falls back to the English slug, and then
 * never hears that the real names arrived.
 */
export function useNamesVersion(): number {
  return useSyncExternalStore(subscribeNames, getNamesVersion, getNamesVersion);
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
