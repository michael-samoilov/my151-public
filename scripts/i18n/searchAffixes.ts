import { pinyin } from 'pinyin-pro';
import { normalizeSearch } from '../../src/i18n/searchNormalize';

/** The 19 Hangul lead consonants, in the order the syllable block encodes them. */
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** Each lead consonant spans 21 medials x 28 finals. */
const CHOSEONG_SPAN = 588;

function jamoInitials(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSEONG[Math.floor((code - HANGUL_BASE) / CHOSEONG_SPAN)];
    } else {
      out += ch;
    }
  }
  return out;
}

function pinyinFull(text: string): string {
  return pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
}

function pinyinInitials(text: string): string {
  return pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' })
    .join('')
    .toLowerCase();
}

/**
 * The extra spellings for one name — everything a query might match *beyond*
 * the name itself. Empty for the Latin locales, whose names need only the
 * folding the normalizer already does.
 *
 * Deliberately not including the name: it is already in the catalog, and a
 * catalog that stored a derived copy of it beside it would be a copy that can
 * drift. The runtime folds the name and joins it to this on load, once.
 *
 * Every part goes through the same normalizer the query will, including the
 * jamo: NFKC maps the compatibility letters a Korean keyboard emits (ㅍ,
 * U+314D) onto the conjoining forms (U+1111), so an index built from the raw
 * ones would never match a normalized query — they render identically, which
 * is exactly why it is worth stating.
 */
export function searchAffix(locale: string, name: string, romaji?: string): string {
  const parts: string[] = [];
  if (locale === 'ja' && romaji) parts.push(romaji);
  if (locale === 'ko') parts.push(jamoInitials(name));
  if (locale === 'zh-Hans' || locale === 'zh-Hant') {
    parts.push(pinyinFull(name), pinyinInitials(name));
  }
  const folded = normalizeSearch(name);
  return [...new Set(parts.map(normalizeSearch).filter((p) => p && p !== folded))].join(' ');
}
