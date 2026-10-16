import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { direction, htmlLang, type Locale } from './config';
import { getLocale, getVersion, subscribe, translate, translatePlural } from './core';
import { getNamesVersion, subscribeNames } from './names';
import type { TFn, TnFn, PluralBase } from './types';

export function useLocale(): Locale {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return getLocale();
}

export function useT(): TFn {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    void version;
    return ((key, ...args) => translate(key, ...args)) as TFn;
  }, [version]);
}

export function useTn(): TnFn {
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  return useMemo(() => {
    void version;
    return (base: PluralBase, count: number, args?: Record<string, string | number>) =>
      translatePlural(base, count, args);
  }, [version]);
}

export function useNamesVersion(): number {
  return useSyncExternalStore(subscribeNames, getNamesVersion, getNamesVersion);
}

export function useDocumentLocale(): void {
  const locale = useLocale();
  useEffect(() => {
    const root = document.documentElement;
    const lang = htmlLang(locale);
    const dir = direction(locale);
    if (root.lang !== lang) root.lang = lang;
    if (root.dir !== dir) root.dir = dir;
  }, [locale]);
}
