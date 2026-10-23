import { PREVIEW_FEATURES } from '@/lib/demoMode';
import { en } from './catalogs/en';
import { DEFAULT_LOCALE, isLocale, type Locale } from './config';
import { setCatalog } from './core';
import { negotiateLocale } from './detect';
import { loadNames, hasNameExtension } from './names';
import { isPseudoLocale, type PseudoLocale } from './pseudoLocale';
import type { Messages } from './types';

type ActiveLocale = Locale | PseudoLocale;

function langParam(search: string): string | null {
  try {
    return new URLSearchParams(search).get('lang');
  } catch {
    return null;
  }
}

function resolveActiveLocale(opts: {
  search?: string;
  stored?: Locale | null;
  navigatorLanguages?: readonly string[];
}): ActiveLocale {
  const param = opts.search !== undefined ? langParam(opts.search) : null;

  if (PREVIEW_FEATURES && isPseudoLocale(param)) return param;
  if (isLocale(param)) return param;
  if (opts.stored) return opts.stored;
  return negotiateLocale(opts.navigatorLanguages ?? []);
}

const TERM_SOURCES = import.meta.glob<Record<string, string>>('./catalogs/terms/*.json', {
  import: 'default',
});

const UI_SOURCES = import.meta.glob<Record<string, string>>('./catalogs/ui/*.json', {
  import: 'default',
});

async function loadCatalog(locale: ActiveLocale): Promise<Messages> {
  if (isPseudoLocale(locale)) {
    const { buildPseudoCatalog } = await import('./pseudo');
    return buildPseudoCatalog(locale, en);
  }
  const loadTerms = TERM_SOURCES[`./catalogs/terms/${locale}.json`];
  if (!loadTerms) return en;
  const loadUi = UI_SOURCES[`./catalogs/ui/${locale}.json`];
  const [terms, ui] = await Promise.all([loadTerms(), loadUi ? loadUi() : {}]);
  return {
    ...en,
    ...terms,
    ...ui,
  } as Messages;
}

function baseLocale(locale: ActiveLocale): Locale {
  return isPseudoLocale(locale) ? DEFAULT_LOCALE : locale;
}

export async function applyLocale(locale: ActiveLocale): Promise<void> {
  const base = baseLocale(locale);
  const names = loadNames(base);
  const catalog = await loadCatalog(locale);
  if (hasNameExtension()) await names;
  setCatalog(base, catalog);
  await names;
}

export async function initLocale(opts: {
  search?: string;
  stored?: Locale | null;
  navigatorLanguages?: readonly string[];
  timeoutMs?: number;
}): Promise<void> {
  const locale = resolveActiveLocale(opts);

  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, opts.timeoutMs ?? 1200),
  );

  const ready = locale === DEFAULT_LOCALE ? loadNames(DEFAULT_LOCALE) : applyLocale(locale);

  await (hasNameExtension() ? ready : Promise.race([ready, timeout]));
}
