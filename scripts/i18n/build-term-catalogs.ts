/**
 * Generates `src/i18n/catalogs/terms/<locale>.json` — the `official` tier:
 * type names, Pokédex colours, egg groups and regions, in all nine locales.
 *
 * These are the strings the launch scope cares most about and the only ones
 * that need no translation at all: PokeAPI publishes the terms the games
 * themselves use. Sourcing beats translating here — a machine-translated
 * "Fire" might read fine and still be the wrong word for a Pokémon type.
 *
 * Egg groups have no row for language 11 (Japanese kanji); the app uses
 * language 1 (ja-Hrkt) throughout, which is both what the games show and what
 * is fully populated.
 *
 * Run: npm run i18n:terms
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { LANGUAGE_IDS, ensureCsvs, readCsv } from './pokeapi';

const OUT_DIR = 'src/i18n/catalogs/terms';

/** App key suffix -> PokeAPI row id, for each term family. */
const TYPES: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6, bug: 7,
  ghost: 8, steel: 9, fire: 10, water: 11, grass: 12, electric: 13,
  psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};
const COLORS: Record<string, number> = {
  black: 1, blue: 2, brown: 3, gray: 4, green: 5,
  pink: 6, purple: 7, red: 8, white: 9, yellow: 10,
};
const EGG_GROUPS: Record<string, number> = {
  monster: 1, water1: 2, bug: 3, flying: 4, ground: 5, fairy: 6, plant: 7,
  humanshape: 8, water3: 9, mineral: 10, indeterminate: 11, water2: 12,
  ditto: 13, dragon: 14, 'no-eggs': 15,
};
const REGIONS: Record<string, number> = {
  kanto: 1, johto: 2, hoenn: 3, sinnoh: 4, unova: 5,
  kalos: 6, alola: 7, galar: 8, hisui: 9, paldea: 10,
};

function index(rows: Record<string, string>[], idCol: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) out.set(`${r[idCol]}:${r.local_language_id}`, r.name);
  return out;
}

async function main(): Promise<void> {
  await ensureCsvs();
  mkdirSync(OUT_DIR, { recursive: true });

  const sources = [
    { prefix: 'term.type', ids: TYPES, rows: index(readCsv('type_names'), 'type_id') },
    { prefix: 'term.color', ids: COLORS, rows: index(readCsv('pokemon_color_names'), 'pokemon_color_id') },
    { prefix: 'term.eggGroup', ids: EGG_GROUPS, rows: index(readCsv('egg_group_prose'), 'egg_group_id') },
    { prefix: 'region', ids: REGIONS, rows: index(readCsv('region_names'), 'region_id') },
  ];

  for (const [locale, langId] of Object.entries(LANGUAGE_IDS)) {
    const out: Record<string, string> = {};
    const missing: string[] = [];
    for (const { prefix, ids, rows } of sources) {
      for (const [key, id] of Object.entries(ids)) {
        // region_names.csv has no Spanish rows at all. Region names are proper
        // nouns that fr/de/it render identically to English, so English is a
        // faithful stand-in rather than an untranslated gap.
        const value = rows.get(`${id}:${langId}`) ?? rows.get(`${id}:${LANGUAGE_IDS.en}`);
        if (value) out[`${prefix}.${key}`] = value;
        else missing.push(`${prefix}.${key}`);
      }
    }
    const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
    writeFileSync(`${OUT_DIR}/${locale}.json`, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(
      `  ${locale.padEnd(8)} ${String(Object.keys(out).length).padStart(3)} terms` +
        (missing.length ? `   missing: ${missing.join(', ')}` : ''),
    );
  }
}

void main();
