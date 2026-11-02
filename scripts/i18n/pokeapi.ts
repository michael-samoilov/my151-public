

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const CACHE_DIR = 'docs/i18n/pokeapi';

const CSVS = [
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
  'items',
  'item_names',
] as const;

type CsvName = (typeof CSVS)[number];

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

// platform: PokeAPI CSV dumps quote fields that contain commas, so this reader follows RFC 4180.
function parseCsv(text: string): Record<string, string>[] {
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

// platform: PokeAPI language 11 (Japanese kanji) has gaps in egg groups and stat names, so Japanese uses 1 (ja-Hrkt).
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

export const ROMAJI_LANGUAGE_ID = 2;
