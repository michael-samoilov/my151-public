import { describe, expect, it } from 'vitest';
import { normalizeSearch } from './searchNormalize';

describe('search normalization', () => {
  it('folds hiragana to katakana, so an unconverted IME commit still matches', () => {
    // The catalogs hold katakana. Typing ぴかちゅう and pressing Enter without
    // converting is ordinary, and used to match nothing at all.
    expect(normalizeSearch('ぴかちゅう')).toBe('ピカチュウ');
    expect(normalizeSearch('ふしぎだね')).toBe('フシギダネ');
    expect(normalizeSearch('ぜにがめ')).toBe('ゼニガメ');
  });

  it('accepts ss for ß', () => {
    // Not an accent, so decomposition never touches it — but it is the one
    // German substitution people actually type.
    expect(normalizeSearch('Furnifraß')).toBe('furnifrass');
    expect(normalizeSearch('Furnifrass')).toBe('furnifrass');
  });
});
