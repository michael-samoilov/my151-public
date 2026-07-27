import { describe, expect, it } from 'vitest';
import { jamoInitials, pinyinFull, pinyinInitials, searchAffix } from './searchAffixes';
import { normalizeSearch } from '../../src/i18n/searchNormalize';

describe('search affixes', () => {
  it('takes the lead consonant of each Hangul syllable', () => {
    // How Korean apps are searched: typing ㅍㅋㅊ finds 피카츄.
    expect(jamoInitials('피카츄')).toBe('ㅍㅋㅊ');
    expect(jamoInitials('이상해씨')).toBe('ㅇㅅㅎㅆ');
    // Tense consonants keep their own initial rather than folding to the plain
    // one — ㄲ, not ㄱ.
    expect(jamoInitials('꼬부기')).toBe('ㄲㅂㄱ');
  });

  it('romanizes Han in both scripts', () => {
    expect(pinyinFull('皮卡丘')).toBe('pikaqiu');
    expect(pinyinInitials('妙蛙种子')).toBe('mwzz');
    // Simplified and traditional forms of the same character read the same.
    expect(pinyinFull('龙')).toBe(pinyinFull('龍'));
  });

  it('gives each locale only the affixes its keyboard needs', () => {
    expect(searchAffix('ja', 'ピカチュウ', 'Pikachu')).toBe('pikachu');
    // Normalized, so the stored jamo are the conjoining forms NFKC produces —
    // which is what a normalized query will be too, however it was typed.
    expect(searchAffix('ko', '피카츄')).toBe(normalizeSearch('ㅍㅋㅊ'));
    expect(searchAffix('zh-Hans', '皮卡丘')).toBe('pikaqiu pkq');
    // Latin locales need nothing beyond the folding the normalizer already
    // does, so they ship no affixes at all.
    expect(searchAffix('fr', 'Flabébé')).toBe('');
    expect(searchAffix('de', 'Furnifraß')).toBe('');
  });

  it('never repeats the name it is an affix for', () => {
    // The name is already in the catalog; storing a derived copy of it beside
    // itself is a copy that can drift, and 1,025 of them per locale.
    expect(searchAffix('ja', 'ピカチュウ', 'ピカチュウ')).toBe('');
    expect(searchAffix('en', 'Pikachu')).toBe('');
  });
});
