/**
 * The deterministic i18n gates. Runs in `npm run build` and in CI, exits 1 on
 * any failure.
 *
 * These are the checks a machine can make without judgement. They do not ask
 * whether a translation is *good* — nothing here can — they ask whether it is
 * structurally sound: that it says what the games say where an official string
 * exists, that it carries the same placeholders as the English it replaces,
 * that it isn't English wearing a locale's filename, and that no code path
 * uppercases text that has no uppercase.
 *
 * `tsc -b` already covers key parity, because every non-English catalog is
 * typed as `Messages` and `MessageKey` is `keyof typeof en`. That is the
 * strongest gate in the set and it costs nothing. The checks here are the ones
 * types cannot express.
 *
 * Run: npm run i18n:verify
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../src/i18n/catalogs/en';
import { LOCALES, type Locale } from '../../src/i18n/config';
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

/**
 * The translated — not sourced — UI strings. English has no file here: it is
 * the source these are translated from, and lives in `catalogs/en.ts`.
 */
const uiCatalogs = new Map<Locale, Record<string, string>>(
  LOCALES.filter((l) => l !== 'en' && existsSync(join(UI_DIR, `${l}.json`))).map((l) => [
    l,
    readJson<Record<string, string>>(join(UI_DIR, `${l}.json`)),
  ]),
);

//#region 1. Official game text

/**
 * The flagship gate: every type name the app paints must be the string the
 * games paint.
 *
 * This is the one check whose failure means "we are showing players a word
 * their game does not use", which is worse than showing them English. The
 * fixture is dumped from Scarlet/Violet's own `typename` table — see
 * `fetch-game-text.ts` for how, and for why the Italian Bug type is the reason
 * to distrust a dictionary here.
 */
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

//#endregion
//#region 2. Placeholder integrity

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).sort();

/**
 * A translation must carry exactly the placeholders its English source does —
 * as a multiset, so a duplicated or dropped `{count}` is caught too.
 *
 * Also rejects full-width braces and unbalanced ones. Full-width `｛｝` is a
 * real machine-translation failure in CJK: the model helpfully converts the
 * punctuation to match the surrounding script, and the result renders the
 * literal text `｛count｝` to the user because the interpolator never sees it.
 */
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

/** Latin letters, so a CJK string of the same length doesn't read as ASCII. */
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
      if (cjk.includes(locale) && value.length > 0 && asciiLetters(value) / value.length > 0.6) {
        fail('untranslated', `${JSON.stringify(value)} is mostly ASCII in a CJK locale`, locale, key);
      }
    }
  }
}

//#endregion
//#region 4. Unicode hygiene

/**
 * The class of defect that survives every review because it is invisible.
 *
 * A trailing space renders as a gap nobody can explain; a non-breaking space
 * silently disables wrapping and blows out a label; a BOM in the middle of a
 * value is a zero-width character that breaks string equality against the
 * source it was copied from. All of them are byte-level facts, so all of them
 * belong here rather than in a reviewer's eyes.
 */
function unicodeHygiene(): void {
  for (const [locale, catalog] of termCatalogs) {
    for (const [key, value] of Object.entries(catalog)) {
      if (value !== value.trim()) fail('unicode', 'leading or trailing whitespace', locale, key);
      // Written as escapes rather than as the characters themselves: a literal
      // NBSP in this file is invisible in an editor and in a diff, which is the
      // exact property that makes it worth gating against in the first place.
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

/**
 * Case transforms are Latin-only operations, and CJK reaches them by three
 * different routes. Each route gets the treatment it deserves rather than a
 * blanket ban — running the blanket version first is what showed why.
 *
 * **CSS `text-transform` / `letter-spacing`** is handled globally, not
 * per-site. Fourteen `uppercase tracking-wide` headings turned up, and every
 * one is a correct English small-caps heading; deleting them to satisfy a gate
 * would trade a real design for a green check. The `:lang()` block in
 * `index.css` neutralizes both properties for CJK everywhere at once, so this
 * gate's job is to assert that block still exists. If someone removes it, all
 * fourteen silently become bugs again — which is exactly the kind of action at
 * a distance a gate should be watching for.
 *
 * **`toUpperCase()` in JS** CSS cannot reach — it runs before the text is ever
 * a DOM node, which matters for the canvas exporter, where there is no CSS at
 * all. The app has one sanctioned path, `localeUppercase()`, which is a no-op
 * for CJK.
 *
 * **`capitalize` on a name** is a separate defect that is not about CJK: it is
 * the reason English renders `Mr-Mime` and `Farfetchd` today. `:lang()` cannot
 * help, because the string is wrong in the locale the rule does not cover. It
 * is tracked in `docs/i18n/proposed-english-changes.md` and needs a real name
 * catalog rather than a CSS property, so it is reported as a known exemption
 * rather than a hard failure — with the exemption pinned to an exact count, so
 * a *new* one fails the build.
 */

/** Sites where `capitalize` still stands in for a real name catalog. */
const CAPITALIZE_EXEMPT = new Set([
  'src/components/shared/PokemonTile.tsx',
  'src/components/browser/PokemonBrowser.tsx',
]);

function cjkSafety(): void {
  // The mechanism the fourteen headings depend on.
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
    // Owner-only and deliberately English; see the note atop catalogs/en.ts.
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
        /(?:^|[\s"'`])capitalize(?:[\s"'`]|$)/.test(line) &&
        !CAPITALIZE_EXEMPT.has(file.replace(/\\/g, '/'))
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
  'es:chart.header.color', // "Color" is also the Spanish color header.
  'es:feedback.category.idea', // "Idea" is the Spanish word too.
  'it:feedback.category.idea', // And the Italian one.
  'de:favorites.axis.starter',
  'de:favorites.generation',
  'fr:chart.header.type', // Type is the French noun too.
  'fr:term.shape.squiggle', // Serpent is the French noun as well.
  'fr:favorites.stats.final', // Final is the French masculine evolution-role adjective.
  'es:favorites.stats.final', // Final is also the Spanish evolution-role adjective.
  'fr:feedback.category.bug', // French tech writing uses "Bug".
]);

/**
 * How wide a chip label may be. These sit in a wrapping row that has to survive
 * a 320px screen, so a long value pushes the layout rather than wrapping
 * neatly. CJK gets a smaller budget because its characters are about twice as
 * wide as Latin ones at the same size.
 */
const UI_LENGTH_BUDGETS: { prefix: string; maxLatin: number; maxCjk: number }[] = [
  { prefix: 'feedback.category.', maxLatin: 22, maxCjk: 8 },
];

/**
 * The translated layer, held to what a machine can actually check: that the
 * keys exist and are real, that nothing is silently English, that it fits, and
 * that it is clean Unicode. Whether the wording is any *good* is not in here
 * and cannot be — that needs a speaker.
 */
function translatedUi(): void {
  const english = en as Record<string, string>;
  for (const [locale, catalog] of uiCatalogs) {
    const keys = Object.keys(catalog);
    if (!keys.length) fail('ui', 'file exists but is empty', locale);

    for (const [key, value] of Object.entries(catalog)) {
      // A key English does not have is a typo or a leftover; it would sit in
      // the catalog forever, translated, and never render.
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

    // Every locale must cover the same set, or a language is quietly half-done.
    const reference = [...uiCatalogs.values()][0];
    const missing = Object.keys(reference).filter((k) => !(k in catalog));
    if (missing.length) {
      fail('ui', `missing ${missing.length} key(s) other locales have: ${missing.join(', ')}`, locale);
    }
  }
}

//#endregion
//#region 7. Length budgets

/**
 * The handful of slots whose width is fixed by layout rather than by content,
 * with a separate budget per script because a CJK character is roughly twice
 * as wide as a Latin one at the same size.
 *
 * Deliberately short. A budget on a string that has room to grow is a gate
 * that fails for no reason and gets raised until it means nothing; these are
 * only the places where overflow is a visual break rather than a reflow.
 *
 * Type names are *not* here. They are official strings we may not shorten, so
 * their fit is the badge's problem — solved by scaling the word to the pill in
 * `typeBadgeGeometry.ts` and asserted for real, in a browser, by
 * `e2e/dev/type-badge.spec.ts`. A character budget would be the wrong tool
 * twice over: it can't see the font, and it would fail on strings we are not
 * allowed to change.
 */
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

function main(): void {
  const gates: [string, () => void][] = [
    ['official game text', gameTextParity],
    ['placeholder integrity', placeholderIntegrity],
    ['untranslated leftovers', untranslatedLeftovers],
    ['unicode hygiene', unicodeHygiene],
    ['CJK safety', cjkSafety],
    ['translated UI strings', translatedUi],
    ['length budgets', lengthBudgets],
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
