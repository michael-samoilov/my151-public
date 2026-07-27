import { pinyin } from 'pinyin-pro';
import { normalizeSearch } from '../../src/i18n/searchNormalize';

/**
 * What someone might actually type to find a Pokémon in each script.
 *
 * A name in a script the user's keyboard cannot easily produce is a name they
 * cannot search for. Japanese is typed by romaji and converted; Korean by jamo,
 * of which the initials alone are a search convention every Korean app
 * supports; Chinese by pinyin, with initials as the same shorthand. Latin
 * locales need only diacritic folding, which the normalizer already does.
 *
 * These are generated into the per-locale name catalogs, not computed in the
 * browser: pinyin needs a ~1 MB reading table, and none of it changes between
 * runs.
 */

/** The 19 Hangul lead consonants, in the order the syllable block encodes them. */
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** Each lead consonant spans 21 medials x 28 finals. */
const CHOSEONG_SPAN = 588;

/**
 * The lead consonants of a Hangul word: 피카츄 -> ㅍㅋㅊ.
 *
 * Typing initials is how Korean apps are searched — it is what a Korean user
 * expects, not a clever extra. Characters outside the syllable block (a digit,
 * a middle dot) are kept as they are so the run still lines up with the word.
 */
export function jamoInitials(text: string): string {
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

/** Toneless pinyin, run together: 妙蛙种子 -> `miaowazhongzi`. */
export function pinyinFull(text: string): string {
  return pinyin(text, { toneType: 'none', type: 'array' }).join('').toLowerCase();
}

/** Pinyin initials: 妙蛙种子 -> `mwzz`. The same shorthand jamo initials are. */
export function pinyinInitials(text: string): string {
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
