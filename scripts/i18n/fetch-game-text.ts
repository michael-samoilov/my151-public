

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { LOCALES, type Locale } from '../../src/i18n/config';

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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
