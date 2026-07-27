/**
 * Fetch and parse the PokeAPI CSV dumps that carry localized names.
 *
 * Cached under docs/i18n/pokeapi/, matching the existing
 * docs/biome-research/pokeapi/ convention: the data is versioned upstream and
 * changes rarely, so a checked-in copy makes the build reproducible and keeps
 * the generator usable offline.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
export const CACHE_DIR = 'docs/i18n/pokeapi';

/** The CSVs the name pipeline reads. */
export const CSVS = [
  'languages',
  'pokemon',
  'pokemon_species',
  'pokemon_species_names',
  'pokemon_forms',
  'pokemon_form_names',
  'type_names',
  'pokemon_color_names',
  'egg_group_prose',
  'region_names',
] as const;

export type CsvName = (typeof CSVS)[number];

export async function ensureCsvs(force = false): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const name of CSVS) {
    const path = join(CACHE_DIR, `${name}.csv`);
    if (!force && existsSync(path)) continue;
    const res = await fetch(`${BASE}/${name}.csv`);
    if (!res.ok) throw new Error(`fetch ${name}.csv failed: ${res.status}`);
    writeFileSync(path, await res.text());
    console.log(`  fetched ${name}.csv`);
  }
}

/**
 * Minimal RFC-4180 reader. PokeAPI's dumps do use quoted fields containing
 * commas (a German growth-rate name is "langsam, dann sehr schnell"), so
 * splitting on commas would corrupt rows.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

export function readCsv(name: CsvName): Record<string, string>[] {
  return parseCsv(readFileSync(join(CACHE_DIR, `${name}.csv`), 'utf8'));
}

/**
 * PokeAPI language ids for the nine locales the app ships. Japanese uses 1
 * (ja-Hrkt, kana) rather than 11 (kanji): it is what the games display, and 11
 * has gaps in egg groups and stat names.
 */
export const LANGUAGE_IDS = {
  en: 9,
  ja: 1,
  ko: 3,
  'zh-Hans': 12,
  'zh-Hant': 4,
  fr: 5,
  de: 6,
  es: 7,
  it: 8,
} as const;

/** Romaji, used only to build the Japanese search index. */
export const ROMAJI_LANGUAGE_ID = 2;
