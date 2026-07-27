import { describe, expect, it } from 'vitest';
import { jamoInitials, pinyinFull, pinyinInitials, searchText } from './searchAffixes';
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
    expect(searchText('ja', 'ピカチュウ', 'Pikachu')).toBe('ピカチュウ pikachu');
    // Normalized, so the stored jamo are the conjoining forms NFKC produces —
    // which is what a normalized query will be too, however it was typed.
    expect(searchText('ko', '피카츄')).toBe(normalizeSearch('피카츄 ㅍㅋㅊ'));
    expect(searchText('zh-Hans', '皮卡丘')).toBe('皮卡丘 pikaqiu pkq');
    // And the raw compatibility letters a keyboard emits normalize onto it.
    expect(searchText('ko', '피카츄').split(' ')[1]).toBe(normalizeSearch('ㅍㅋㅊ'));
    // Latin locales need nothing beyond the folded name.
    expect(searchText('fr', 'Flabébé')).toBe('flabebe');
  });

  it('does not repeat an affix that equals the name', () => {
    // French and English share plenty of names; the prepared string is checked
    // once per Pokémon per keystroke, so duplication is not free.
    expect(searchText('fr', 'Pikachu')).toBe('pikachu');
  });
});
