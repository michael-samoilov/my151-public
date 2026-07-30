/**
 * Extract the type names the games themselves display, from a dump of the
 * games' own text, and write them out as a checked-in source of truth.
 *
 * ## Why this exists
 *
 * The type badges were being filled from PokeAPI's `type_names.csv`, which is
 * a community-maintained database. It is almost certainly right, but "almost
 * certainly right" is not the same as sourced, and there is a specific reason
 * to doubt it: the type badge is a fixed-width slot, and fixed-width slots are
 * where localizers abbreviate. Italian really did ship `Coleott.` rather than
 * `Coleottero` for Bug — see below — so the question of whether a database's
 * dictionary form is what the badge paints is a real one, not a pedantic one.
 *
 * So this reads the actual shipped strings instead.
 *
 * ## The source
 *
 * `abcboy101/poke-corpus` is a corpus of text dumped from the games. Its
 * `gh-pages` branch carries one gzipped file per game per language, all
 * line-aligned against a `qid` file of message identifiers — so line N is the
 * same message in every language, and the `qid` file says which message that
 * is. Scarlet/Violet's `common` file has a `typename` table whose entries are
 * `sv.typename.TYPENAME_000` through `_020`, and those are the strings the
 * game paints on a type badge.
 *
 * Pinned to a commit, and every file's SHA-256 is recorded in the output, so a
 * re-run either reproduces the fixture byte-for-byte or fails loudly.
 *
 * ## What it found
 *
 * All 162 strings (18 types x 9 languages) match what the app already ships.
 * That is the useful result: the data was right, and is now sourced rather
 * than trusted. `verify.ts` asserts the match on every build.
 *
 * It also settles the Italian question. Bulbapedia's Type article says that
 * from Generation VI on, every language uses full type names "except Italian,
 * which retains an abbreviated form for the Bug type". Against the dumps that
 * is false for Gen VI onward and true before it: `Coleott.` is in the Gen IV
 * and Gen V type tables (Platinum, Black 2/White 2 `common` file 398, entry 6)
 * and appears nowhere in the X/Y, Sun/Moon, Sword/Shield, Legends: Arceus or
 * Scarlet/Violet Italian text, all of which spell `Coleottero` in full. So the
 * modern badge shows the full word, and the app should too — which means the
 * fitting problem is ours to solve in layout rather than by abbreviating.
 *
 * Run: npm run i18n:game-text
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { LOCALES, type Locale } from '../../src/i18n/config';

/**
 * poke-corpus at a fixed commit. Resolve a newer one with
 * `git ls-remote https://github.com/abcboy101/poke-corpus.git refs/heads/gh-pages`.
 */
const COMMIT = 'd74a89ba69cbabc491b65c3e88af8722bb34a927';
const BASE = `https://raw.githubusercontent.com/abcboy101/poke-corpus/${COMMIT}/corpus`;
const COLLECTION = 'ScarletViolet';

export const GAME_TEXT_PATH = 'docs/i18n/sources/scarlet-violet-typenames.json';

/**
 * The corpus labels Japanese `ja`; every other code matches ours. The corpus
 * has no `ja-Hrkt` for Scarlet/Violet at all — Gen IX dropped the kanji/kana
 * split that made two Japanese columns necessary in the first place.
 */
const CORPUS_LANG: Record<Locale, string> = {
  en: 'en', ja: 'ja', ko: 'ko', 'zh-Hans': 'zh-Hans', 'zh-Hant': 'zh-Hant',
  fr: 'fr', de: 'de', es: 'es', it: 'it',
};

/**
 * The app's type slugs against the game's table index.
 *
 * Not a plain array, because the table skips 009 and 019: the game's internal
 * type enum reserves those slots (`_020` is Stellar, the Terastal-only type
 * that has no Pokémon and so no badge here). Writing the identifier out means
 * a re-run against a re-indexed dump fails rather than silently shifting every
 * name by one.
 */
const TYPES: [slug: string, id: string][] = [
  ['normal', '000'], ['fighting', '001'], ['flying', '002'], ['poison', '003'],
  ['ground', '004'], ['rock', '005'], ['bug', '006'], ['ghost', '007'],
  ['steel', '008'], ['fire', '010'], ['water', '011'], ['grass', '012'],
  ['electric', '013'], ['psychic', '014'], ['ice', '015'], ['dragon', '016'],
  ['dark', '017'], ['fairy', '018'],
];

/** What `verify.ts` reads. */
export interface GameTextSource {
  readonly source: {
    readonly repo: string;
    readonly commit: string;
    readonly collection: string;
    readonly file: string;
    readonly table: string;
    readonly retrieved: string;
    /** SHA-256 of each gzipped file as fetched, so a re-run is checkable. */
    readonly sha256: Record<string, string>;
  };
  /** `term.type.<slug>` -> locale -> the string the game paints. */
  readonly types: Record<string, Record<string, string>>;
}

async function fetchLines(lang: string): Promise<{ lines: string[]; sha256: string }> {
  const url = `${BASE}/${COLLECTION}/${lang}_common.txt.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  return {
    // The dumps are CRLF. Splitting on "\n" alone leaves a trailing carriage
    // return on every value, which is invisible in a console and would be
    // baked straight into the badge labels.
    lines: gunzipSync(gz).toString('utf8').split(/\r?\n/),
    sha256: createHash('sha256').update(gz).digest('hex'),
  };
}

async function main(): Promise<void> {
  const sha256: Record<string, string> = {};

  // The identifier file. Every language file is line-aligned against it, which
  // is what makes a single line number mean the same message in all nine.
  const ids = await fetchLines('qid');
  sha256['qid'] = ids.sha256;

  const rowOf = new Map<string, number>();
  ids.lines.forEach((id, i) => {
    if (id.startsWith('sv.typename.')) rowOf.set(id.slice('sv.typename.'.length), i);
  });

  const types: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const { lines, sha256: hash } = await fetchLines(CORPUS_LANG[locale]);
    sha256[CORPUS_LANG[locale]] = hash;
    if (lines.length !== ids.lines.length) {
      throw new Error(`${locale}: ${lines.length} lines vs ${ids.lines.length} in qid — not aligned`);
    }
    for (const [slug, id] of TYPES) {
      const row = rowOf.get(`TYPENAME_${id}`);
      if (row === undefined) throw new Error(`no TYPENAME_${id} (${slug}) in the dump`);
      const value = lines[row];
      // A control code here would mean the badge composes its label at runtime
      // rather than painting a literal, which would invalidate the whole
      // premise that one string is what the player sees.
      if (!value || value.includes('[VAR ')) throw new Error(`TYPENAME_${id} in ${locale} is not a literal: ${value}`);
      (types[`term.type.${slug}`] ??= {})[locale] = value;
    }
    console.log(`  ${locale.padEnd(8)} ${TYPES.length} types`);
  }

  const out: GameTextSource = {
    source: {
      repo: 'https://github.com/abcboy101/poke-corpus',
      commit: COMMIT,
      collection: COLLECTION,
      file: 'common',
      table: 'sv.typename',
      retrieved: new Date().toISOString().slice(0, 10),
      sha256,
    },
    types,
  };
  mkdirSync('docs/i18n/sources', { recursive: true });
  writeFileSync(GAME_TEXT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\n  wrote ${GAME_TEXT_PATH}`);
}

// `verify.ts` imports the path and the type from here, so fetching must not be
// a side effect of loading the module — otherwise every build re-downloads the
// dumps and rewrites the fixture it is supposed to be checking against.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
