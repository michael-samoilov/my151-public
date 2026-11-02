import { pinyin } from 'pinyin-pro';
import { normalizeSearch } from '../../src/i18n/searchNormalize';

// platform: Unicode orders the 19 Hangul lead consonants this way inside each syllable block.
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const HANGUL_MEDIALS = 21;
const HANGUL_FINALS = 28;
const CHOSEONG_SPAN = HANGUL_MEDIALS * HANGUL_FINALS;

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

// platform: NFKC maps keyboard compatibility jamo (U+314D) onto conjoining jamo (U+1111), so every part goes through normalizeSearch like the query.
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
