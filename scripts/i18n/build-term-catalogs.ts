import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Locale } from '../../src/i18n/config';
import {
  GAME_TERMS_PATH, MOVE_NAMES_PATH, type GameTermsFixture, type MoveNamesFixture,
} from './extract-game-terms';
import { LANGUAGE_IDS, ensureCsvs, readCsv } from './pokeapi';

const OUT_DIR = 'src/i18n/catalogs/terms';
const MOVES_DIR = 'src/i18n/moves';

const HOME_REGION_SUFFIX: Partial<Record<Locale, string>> = {
  en: ' Region', ja: '地方', ko: '지방', 'zh-Hans': '地区', 'zh-Hant': '地區',
};

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

  const gameTerms = JSON.parse(readFileSync(GAME_TERMS_PATH, 'utf8')) as GameTermsFixture;
  const moveNames = JSON.parse(readFileSync(MOVE_NAMES_PATH, 'utf8')) as MoveNamesFixture;
  mkdirSync(MOVES_DIR, { recursive: true });

  for (const [locale, langId] of Object.entries(LANGUAGE_IDS) as [Locale, number][]) {
    const out: Record<string, string> = {};
    const missing: string[] = [];
    for (const { prefix, ids, rows } of sources) {
      for (const [key, id] of Object.entries(ids)) {
        // platform: PokeAPI region_names.csv has no Spanish rows, so the English proper noun stands in.
        const value = rows.get(`${id}:${langId}`) ?? rows.get(`${id}:${LANGUAGE_IDS.en}`);
        if (value) out[`${prefix}.${key}`] = value;
        else missing.push(`${prefix}.${key}`);
      }
    }

    const overrides: string[] = [];
    for (const [id, home] of Object.entries(gameTerms.regions)) {
      const key = `region.${id}`;
      const ours = out[key];
      const theirs = home.text[locale];
      const suffix = HOME_REGION_SUFFIX[locale] ?? '';
      if (!theirs || theirs === ours || theirs === `${ours}${suffix}`) continue;
      if (suffix && theirs.endsWith(suffix)) {
        throw new Error(`${locale} ${key}: PokeAPI says ${ours}, ${home.qid} says ${theirs}; decide which by hand`);
      }
      out[key] = theirs;
      overrides.push(`${key} ${ours} -> ${theirs} (${home.qid})`);
    }

    let sourced = 0;
    if (locale !== 'en') {
      for (const term of gameTerms.terms) {
        const value = term.text[locale];
        if (term.key.startsWith('form.') || !value) continue;
        out[term.key] = value;
        sourced += 1;
      }
      const moves = Object.fromEntries(Object.entries(moveNames.moves).map(([id, row]) => [id, row.text[locale]]));
      writeFileSync(`${MOVES_DIR}/${locale}.json`, `${JSON.stringify(moves)}\n`);
    }
    const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
    writeFileSync(`${OUT_DIR}/${locale}.json`, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(
      `  ${locale.padEnd(8)} ${String(Object.keys(out).length).padStart(3)} terms, ${sourced} from game text` +
        (missing.length ? `   missing: ${missing.join(', ')}` : '') +
        (overrides.length ? `   overrides: ${overrides.join('; ')}` : ''),
    );
  }
}

void main();
