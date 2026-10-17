

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../src/i18n/catalogs/en';
import { LOCALES, type Locale } from '../../src/i18n/config';
import { tierOf } from '../../src/i18n/tiers';
import type { MessageKey } from '../../src/i18n/types';
import {
  GAME_TERMS_PATH, MOVE_NAMES_PATH, type GameTermsFixture, type MoveNamesFixture,
} from './extract-game-terms';
import { GAME_TEXT_PATH, type GameTextSource } from './fetch-game-text';

const TERMS_DIR = 'src/i18n/catalogs/terms';
const UI_DIR = 'src/i18n/catalogs/ui';

interface Failure {
  gate: string;
  locale?: string;
  key?: string;
  detail: string;
}

const failures: Failure[] = [];
const fail = (gate: string, detail: string, locale?: string, key?: string) =>
  failures.push({ gate, locale, key, detail });

const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const termCatalogs = new Map<Locale, Record<string, string>>(
  LOCALES.map((l) => [l, readJson<Record<string, string>>(join(TERMS_DIR, `${l}.json`))]),
);

const uiCatalogs = new Map<Locale, Record<string, string>>(
  LOCALES.filter((l) => l !== 'en' && existsSync(join(UI_DIR, `${l}.json`))).map((l) => [
    l,
    readJson<Record<string, string>>(join(UI_DIR, `${l}.json`)),
  ]),
);

//#region 1. Official game text

function gameTextParity(): void {
  const { source, types } = readJson<GameTextSource>(GAME_TEXT_PATH);
  const expectedTypes = Object.keys(types);
  if (expectedTypes.length !== 18) {
    fail('game-text', `fixture has ${expectedTypes.length} types, expected 18`);
  }
  for (const [key, byLocale] of Object.entries(types)) {
    for (const locale of LOCALES) {
      const official = byLocale[locale];
      const shipped = termCatalogs.get(locale)?.[key];
      if (official === undefined) {
        fail('game-text', `fixture has no ${locale} entry`, locale, key);
      } else if (shipped === undefined) {
        fail('game-text', `not in the catalog; the games show ${JSON.stringify(official)}`, locale, key);
      } else if (shipped !== official) {
        fail(
          'game-text',
          `catalog says ${JSON.stringify(shipped)}, ${source.collection} says ${JSON.stringify(official)}`,
          locale,
          key,
        );
      }
    }
  }
}

const gameTerms = readJson<GameTermsFixture>(GAME_TERMS_PATH);
const moveNames = readJson<MoveNamesFixture>(MOVE_NAMES_PATH);
const SOURCED_KEYS = new Set(gameTerms.terms.map((t) => t.key).filter((k) => !k.startsWith('form.')));

/** HOME's box list adds this after a region name; see build-term-catalogs.ts. */
const REGION_SUFFIX: Partial<Record<Locale, string>> = {
  en: ' Region', ja: '地方', ko: '지방', 'zh-Hans': '地区', 'zh-Hant': '地區',
};

function sourcedGameText(): void {
  for (const locale of LOCALES) {
    if (locale === 'en') continue;
    const catalog = termCatalogs.get(locale) ?? {};
    for (const term of gameTerms.terms) {
      if (term.key.startsWith('form.')) continue;
      if (locale === 'de' && tierOf(term.key as MessageKey) !== 'official') {
        fail('game-text', 'sourced from the games but not in the official tier (src/i18n/tiers.ts)', undefined, term.key);
      }
      const want = term.text[locale];
      const got = catalog[term.key];
      if (want !== got) {
        fail('game-text', `catalog says ${JSON.stringify(got)}, ${term.from[0]?.qid ?? 'the fixture'} gives ${JSON.stringify(want)}`, locale, term.key);
      }
      if (uiCatalogs.get(locale)?.[term.key] !== undefined) {
        fail('game-text', 'a translated value in catalogs/ui would hide the sourced one', locale, term.key);
      }
    }
    for (const [id, home] of Object.entries(gameTerms.regions)) {
      const key = `region.${id}`;
      const got = catalog[key];
      const theirs = home.text[locale];
      if (theirs && got !== theirs && theirs !== `${got}${REGION_SUFFIX[locale] ?? ''}`) {
        fail('game-text', `catalog says ${JSON.stringify(got)}, ${home.qid} says ${JSON.stringify(theirs)}`, locale, key);
      }
    }
    const path = `src/i18n/moves/${locale}.json`;
    const shipped = existsSync(path) ? readJson<Record<string, string>>(path) : {};
    for (const [id, row] of Object.entries(moveNames.moves)) {
      if (shipped[id] !== row.text[locale]) {
        fail('game-text', `${path} says ${JSON.stringify(shipped[id])}, ${row.qid} says ${JSON.stringify(row.text[locale])}`, locale, `move ${id}`);
      }
    }
    if (Object.keys(shipped).length !== Object.keys(moveNames.moves).length) {
      fail('game-text', `${path} has ${Object.keys(shipped).length} moves, the fixture ${Object.keys(moveNames.moves).length}`, locale);
    }
  }

  const appMoves = readJson<{ id: number; name: string }[]>('src/data/moves.json');
  for (const move of appMoves) {
    const row = moveNames.moves[move.id];
    if (row?.text.en !== move.name) {
      fail('game-text', `src/data/moves.json says ${JSON.stringify(move.name)}, ${MOVE_NAMES_PATH} says ${JSON.stringify(row?.text.en)}; run npm run i18n:game-terms`, undefined, `move ${move.id}`);
    }
  }
  if (appMoves.length !== Object.keys(moveNames.moves).length) {
    fail('game-text', `src/data/moves.json has ${appMoves.length} moves, ${MOVE_NAMES_PATH} ${Object.keys(moveNames.moves).length}`);
  }
}

//#endregion
//#region 2. Placeholder integrity

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).sort();

function placeholderIntegrity(): void {
  for (const [locale, catalog] of termCatalogs) {
    if (locale === 'en') continue;
    for (const [key, value] of Object.entries(catalog)) {
      const source = (en as Record<string, string>)[key] ?? termCatalogs.get('en')?.[key];
      if (/[｛｝]/.test(value)) {
        fail('placeholders', 'contains a full-width brace', locale, key);
        continue;
      }
      const opens = (value.match(/\{/g) ?? []).length;
      const closes = (value.match(/\}/g) ?? []).length;
      if (opens !== closes) {
        fail('placeholders', `${opens} '{' vs ${closes} '}'`, locale, key);
        continue;
      }
      if (source === undefined) continue;
      const want = placeholders(source).join(',');
      const got = placeholders(value).join(',');
      if (want !== got) {
        fail('placeholders', `English has [${want}], this has [${got}]`, locale, key);
      }
    }
  }
}

//#endregion
//#region 3. Untranslated leftovers

const asciiLetters = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length;

/**
 * Catches a locale file that is really just a copy of English.
 *
 * The obvious form of this check — fail whenever a value equals its English
 * counterpart — is the wrong tool for these particular catalogs, and running
 * it proved as much: it flagged French `Poison`, German `Monster` and
 * `Mineral`, and `Ditto` in three languages. Every one of those is correct.
 * `Poison` really is the French type name, `Monster` and `Mineral` really are
 * German words, and `Ditto` is a Pokémon's name, which does not change.
 *
 * That is not a gap in the allow-list, it is the gate asking the wrong
 * question. These are *official* strings: we do not choose them, we source
 * them, so "this matches English" carries no information about whether anyone
 * did the work. An allow-list here would grow one entry per coincidence until
 * it was longer than the catalog and meant nothing.
 *
 * So the question is asked at the level where the answer is informative: has
 * this locale's file been translated *at all*? A whole catalog that matches
 * English is a copy; a scattering of matching proper nouns is just vocabulary.
 * The threshold is generous — no real locale comes close, and Japanese sits at
 * zero — so it fires on the failure it names and nothing else.
 *
 * The per-value ASCII check underneath is the sharp one, and it needs no
 * allow-list: a ja/ko/zh value that is majority Latin letters is untranslated
 * whether or not it happens to match English, because those scripts have no
 * reason to be.
 */
const COPY_THRESHOLD = 0.6;

function untranslatedLeftovers(): void {
  const english = termCatalogs.get('en') ?? {};
  const cjk: Locale[] = ['ja', 'ko', 'zh-Hans', 'zh-Hant'];
  for (const [locale, catalog] of termCatalogs) {
    if (locale === 'en') continue;

    const entries = Object.entries(catalog);
    const substantive = entries.filter(([, v]) => asciiLetters(v) >= 2);
    const identical = substantive.filter(([k, v]) => v === english[k]);
    if (substantive.length && identical.length / substantive.length > COPY_THRESHOLD) {
      const pct = Math.round((identical.length / substantive.length) * 100);
      fail(
        'untranslated',
        `${pct}% of values are byte-identical to English (${identical.length}/${substantive.length}) — this file looks like a copy`,
        locale,
      );
    }

    for (const [key, value] of entries) {
      // Sourced game text is held to the games themselves: "X／Y" and
      // "Pokémon LEGENDS アルセウス" are what the Chinese and Japanese games say.
      if (SOURCED_KEYS.has(key)) continue;
      if (cjk.includes(locale) && value.length > 0 && asciiLetters(value) / value.length > 0.6) {
        fail('untranslated', `${JSON.stringify(value)} is mostly ASCII in a CJK locale`, locale, key);
      }
    }
  }
}

//#endregion
//#region 4. Unicode hygiene

function unicodeHygiene(): void {
  for (const [locale, catalog] of termCatalogs) {
    for (const [key, value] of Object.entries(catalog)) {
      if (value !== value.trim()) fail('unicode', 'leading or trailing whitespace', locale, key);

      if (/[\u00a0\u2007\u202f]/.test(value)) fail('unicode', 'non-breaking space', locale, key);
      if (/[\ufeff\u200b-\u200d]/.test(value)) fail('unicode', 'zero-width character', locale, key);
      if (value !== value.normalize('NFC')) fail('unicode', 'not NFC-normalized', locale, key);
      if (/[０-９]/.test(value) && /[0-9]/.test(value)) {
        fail('unicode', 'mixes full-width and half-width digits', locale, key);
      }
    }
  }
}

//#endregion
//#region 5. CJK safety

function cjkSafety(): void {
  const css = readFileSync('src/index.css', 'utf8');
  const scoped = /:lang\(ja\)[^{]*\{[^}]*text-transform:\s*none[^}]*letter-spacing:\s*normal/s.test(css);
  if (!scoped) {
    fail(
      'cjk-safety',
      'src/index.css: the :lang(ja),:lang(ko),:lang(zh) block that resets text-transform and ' +
        'letter-spacing is gone — every `uppercase tracking-wide` heading now mangles CJK',
    );
  }

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name)) files.push(path);
    }
  };
  walk('src');

  const translated = String.raw`(?:t|tn|typeLabel|colorLabel|eggGroupLabel|shapeLabel|speciesName|formLabel|displayName)`;
  for (const file of files) {
    if (file.includes('components/admin/')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const where = `${file.replace(/\\/g, '/')}:${i + 1}`;
      if (/\blocaleUppercase\b/.test(line)) return;
      if (new RegExp(String.raw`\b${translated}\([^)]*\)\s*\.toUpperCase\(\)`).test(line)) {
        fail('cjk-safety', `${where}: .toUpperCase() on a translated string — use localeUppercase()`);
      }
      if (
        /className=/.test(line) &&
        /(?:^|[\s"'`])capitalize(?:[\s"'`]|$)/.test(line)
      ) {
        fail(
          'cjk-safety',
          `${where}: \`capitalize\` renders slugs like "Mr-Mime" — take the label from the name catalog instead`,
        );
      }
    });
  }
}

//#endregion
//#region 6. Translated UI strings

/**
 * Values that are legitimately identical to their English source.
 *
 * Listed one by one rather than waved through by a rule, because "it matches
 * English" is exactly what an untranslated string looks like. Each of these is
 * genuinely the same word in that language, and saying so explicitly is what
 * makes the check meaningful for every other key.
 */
const SAME_AS_ENGLISH_OK = new Set([
  // The Pokédex builder's sections. Dojo and Tundra are the same loanwords in
  // these languages; Pika, Pseudo and Fossil are the same one-cell outline
  // forms. Upgrade and Protector are the item names the games use.
  'de:section.dojo', 'de:archetype.dojo', 'de:sectionTiny.dojo',
  'es:section.dojo', 'es:archetype.dojo', 'es:sectionTiny.dojo',
  'fr:section.dojo', 'fr:archetype.dojo', 'fr:sectionTiny.dojo',
  'it:section.dojo', 'it:archetype.dojo', 'it:sectionTiny.dojo',
  'de:section.tundra', 'de:archetype.tundra', 'de:sectionTiny.tundra',
  'es:section.tundra', 'es:archetype.tundra', 'es:sectionTiny.tundra',
  'it:section.tundra', 'it:archetype.tundra', 'it:sectionTiny.tundra',
  'de:sectionTiny.pikachu-clone', 'es:sectionTiny.pikachu-clone',
  'fr:sectionTiny.pikachu-clone', 'it:sectionTiny.pikachu-clone',
  'de:sectionTiny.pseudo-legendary', 'es:sectionTiny.pseudo-legendary',
  'fr:sectionTiny.pseudo-legendary', 'it:sectionTiny.pseudo-legendary',
  'de:sectionTiny.fossil',
  'de:archetype.evolution-item.sub.9', // Upgrade
  'it:archetype.evolution-item.sub.9', // Upgrade
  'es:archetype.evolution-item.sub.19', // Protector
  'es:chart.header.color', // "Color" is also the Spanish color header.
  'es:feedback.category.idea', // "Idea" is the Spanish word too.
  'it:feedback.category.idea', // And the Italian one.
  'de:favorites.axis.starter',
  'de:favorites.generation',
  // The Acknowledgements panel. "Sprite" is the loanword in French, Spanish
  // and Italian, and "Generation" is the German noun.
  'de:ack.generation',
  'es:ack.sprites_one', 'es:ack.sprites_other',
  'fr:ack.sprites_one', 'fr:ack.sprites_other',
  'it:ack.sprites_one',
  'fr:chart.header.type', // Type is the French noun too.
  'fr:term.shape.squiggle', // Serpent is the French noun as well.
  'fr:favorites.stats.final', // Final is the French masculine evolution-role adjective.
  'es:favorites.stats.final', // Final is also the Spanish evolution-role adjective.
  'fr:sort.type', // Type is the French noun too.
  'de:poster.separator',
  'es:poster.separator',
  'fr:poster.separator',
  'it:poster.separator',
  'ja:poster.separator',
  'ko:poster.separator',
  'zh-Hans:poster.separator',
  'zh-Hant:poster.separator',
  'de:league.tm.mark', // The German games label TMs "TM".
  'de:league.powerup.dynamax', // Dynamax is the German, French and Italian game term.
  'fr:league.powerup.dynamax',
  'it:league.powerup.dynamax',
  'fr:league.badge.mark', // The French games say "Badge".
  'fr:league.type.word', // Type is the French noun too.
  'de:league.badge.placeholder', // "Name" is the German noun too.
  'de:league.view.story', // German games and players say "Story".
  'fr:league.tm.col.category', // "Cat." abbreviates Catégorie, Categoría and Categoria.
  'es:league.tm.col.category',
  'it:league.tm.col.category',
  'es:league.tm.col.pp', // PP is the games' own abbreviation in every language but German.
  'fr:league.tm.col.pp',
  'it:league.tm.col.pp',
  'ja:league.tm.col.pp',
  'ko:league.tm.col.pp',
  'zh-Hans:league.tm.col.pp',
  'zh-Hant:league.tm.col.pp',
  'fr:feedback.category.bug', // French tech writing uses "Bug".
  'it:feedback.context.browser', // Italian says "browser".
  'de:browser.sheet.generation', // "Generation" is the German noun.
  'de:browser.subgroupGeneration',
  'de:drilldown.generationTitle',
  'fr:browser.chip.type', // Type is the French noun.
  'fr:browser.sheet.type',
  'fr:analytics.dex.nationalShort', // National is the French adjective.
  'fr:chart.header.score', // French uses "score" for a points total.
  'es:browser.chip.color', // "Color" is the Spanish noun.
  'es:browser.sheet.color',
  // "Pokémon" is the word in all four Latin-script languages.
  'de:stage.columnTotal_one',
  'de:stage.columnTotal_other',
  'de:stage.legendUnit',
  'fr:stage.columnTotal_one',
  'fr:stage.columnTotal_other',
  'fr:stage.legendUnit',
  'es:stage.columnTotal_one',
  'es:stage.columnTotal_other',
  'es:stage.legendUnit',
  'it:stage.columnTotal_one',
  'it:stage.columnTotal_other',
  'it:stage.legendUnit',
  // The footer's Acknowledgements panel. German and French fans say "Sprites",
  // as do Spanish ones; "Code" is the German and French noun.
  'de:ack.group.sprites',
  'fr:ack.group.sprites',
  'es:ack.group.sprites',
  'de:ack.group.code',
  'fr:ack.group.code',
]);

const UI_LENGTH_BUDGETS: { prefix: string; maxLatin: number; maxCjk: number }[] = [
  { prefix: 'feedback.category.', maxLatin: 22, maxCjk: 8 },
];

function translatedUi(): void {
  const english = en as Record<string, string>;
  for (const [locale, catalog] of uiCatalogs) {
    const keys = Object.keys(catalog);
    if (!keys.length) fail('ui', 'file exists but is empty', locale);

    for (const [key, value] of Object.entries(catalog)) {

      if (!(key in english)) {
        fail('ui', 'not a key in the English catalog', locale, key);
        continue;
      }
      if (!value.trim()) {
        fail('ui', 'empty translation — omit the key instead, so it falls back to English', locale, key);
        continue;
      }
      if (value === english[key] && !SAME_AS_ENGLISH_OK.has(`${locale}:${key}`)) {
        fail(
          'ui',
          `identical to English (${JSON.stringify(value)}) — translate it, or add it to SAME_AS_ENGLISH_OK if that is genuinely the word`,
          locale,
          key,
        );
      }
      const budget = UI_LENGTH_BUDGETS.find((b) => key.startsWith(b.prefix));
      if (budget) {
        const max = isCjk(locale) ? budget.maxCjk : budget.maxLatin;
        if ([...value].length > max) {
          fail('ui', `${JSON.stringify(value)} is ${[...value].length} chars, budget ${max}`, locale, key);
        }
      }
    }

    const reference = [...uiCatalogs.values()][0];
    const missing = Object.keys(reference).filter((k) => !(k in catalog));
    if (missing.length) {
      fail('ui', `missing ${missing.length} key(s) other locales have: ${missing.join(', ')}`, locale);
    }
  }
}

//#endregion
//#region 7. Length budgets

const LENGTH_BUDGETS: { prefix: string; maxLatin: number; maxCjk: number; why: string }[] = [
  { prefix: 'region.', maxLatin: 12, maxCjk: 6, why: 'region filter chips' },
  { prefix: 'term.color.', maxLatin: 14, maxCjk: 7, why: 'colour filter chips' },
];

const isCjk = (locale: Locale) => locale === 'ja' || locale === 'ko' || locale.startsWith('zh');

function lengthBudgets(): void {
  for (const [locale, catalog] of termCatalogs) {
    for (const [key, value] of Object.entries(catalog)) {
      const budget = LENGTH_BUDGETS.find((b) => key.startsWith(b.prefix));
      if (!budget) continue;
      const max = isCjk(locale) ? budget.maxCjk : budget.maxLatin;
      if ([...value].length > max) {
        fail('length', `${JSON.stringify(value)} is ${[...value].length} chars, budget ${max} (${budget.why})`, locale, key);
      }
    }
  }
}

//#endregion

//#region Duplicate keys

/**
 * A locale file that lists a key twice still parses: `JSON.parse` keeps the
 * last value and drops the first without a word. Two branches that each
 * translate the same key merge into exactly that, so the gate reads the raw
 * text. The files are flat objects with one key per line.
 */
function duplicateKeys(): void {
  for (const dir of [UI_DIR, TERMS_DIR]) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const seen = new Set<string>();
      for (const match of readFileSync(join(dir, file), 'utf8').matchAll(/^\s*"([^"]+)"\s*:/gm)) {
        if (seen.has(match[1])) fail('duplicate keys', `${dir}/${file} lists this key more than once`, undefined, match[1]);
        seen.add(match[1]);
      }
    }
  }
}

//#endregion

function main(): void {
  const gates: [string, () => void][] = [
    ['official game text', gameTextParity],
    ['sourced game terms and move names', sourcedGameText],
    ['placeholder integrity', placeholderIntegrity],
    ['untranslated leftovers', untranslatedLeftovers],
    ['unicode hygiene', unicodeHygiene],
    ['CJK safety', cjkSafety],
    ['translated UI strings', translatedUi],
    ['length budgets', lengthBudgets],
    ['duplicate keys', duplicateKeys],
  ];

  for (const [name, gate] of gates) {
    const before = failures.length;
    gate();
    const added = failures.length - before;
    console.log(`  ${added ? '✗' : '✓'} ${name}${added ? ` — ${added} failure${added === 1 ? '' : 's'}` : ''}`);
  }

  if (failures.length) {
    console.error(`\ni18n:verify failed with ${failures.length} problem${failures.length === 1 ? '' : 's'}:\n`);
    for (const f of failures) {
      const at = [f.locale, f.key].filter(Boolean).join(' ');
      console.error(`  [${f.gate}] ${at ? `${at}: ` : ''}${f.detail}`);
    }
    process.exit(1);
  }
  console.log('\ni18n:verify passed');
}

main();
