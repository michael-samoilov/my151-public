

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

const CORPUS_LANG: Record<Locale, string> = {
  en: 'en', ja: 'ja', ko: 'ko', 'zh-Hans': 'zh-Hans', 'zh-Hant': 'zh-Hant',
  fr: 'fr', de: 'de', es: 'es', it: 'it',
};

// platform: The game's type table skips indexes 009 and 019, so each slug names its index and a re-indexed dump fails.
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
    readonly sha256: Record<string, string>;
  };
  readonly types: Record<string, Record<string, string>>;
}

async function fetchLines(lang: string): Promise<{ lines: string[]; sha256: string }> {
  const url = `${BASE}/${COLLECTION}/${lang}_common.txt.gz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  return {
    // platform: The poke-corpus dumps use CRLF line endings, so a bare "\n" split leaves a carriage return on each value.
    lines: gunzipSync(gz).toString('utf8').split(/\r?\n/),
    sha256: createHash('sha256').update(gz).digest('hex'),
  };
}

async function main(): Promise<void> {
  const sha256: Record<string, string> = {};

  const qidFile = await fetchLines('qid');
  sha256['qid'] = qidFile.sha256;

  const rowOf = new Map<string, number>();
  qidFile.lines.forEach((id, i) => {
    if (id.startsWith('sv.typename.')) rowOf.set(id.slice('sv.typename.'.length), i);
  });

  const types: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const { lines, sha256: hash } = await fetchLines(CORPUS_LANG[locale]);
    sha256[CORPUS_LANG[locale]] = hash;
    if (lines.length !== qidFile.lines.length) {
      throw new Error(`${locale}: ${lines.length} lines vs ${qidFile.lines.length} in qid — not aligned`);
    }
    for (const [slug, id] of TYPES) {
      const row = rowOf.get(`TYPENAME_${id}`);
      if (row === undefined) throw new Error(`no TYPENAME_${id} (${slug}) in the dump`);
      const value = lines[row];
      // platform: A [VAR control code means the game composes the label at runtime, so the line is no literal.
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
