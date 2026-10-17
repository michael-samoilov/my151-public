import { describe, expect, it } from 'vitest';
import { normalizeSearch } from './searchNormalize';

describe('search normalization', () => {
  it('folds hiragana to katakana, so an unconverted IME commit still matches', () => {
    expect(normalizeSearch('ぴかちゅう')).toBe('ピカチュウ');
    expect(normalizeSearch('ふしぎだね')).toBe('フシギダネ');
    expect(normalizeSearch('ぜにがめ')).toBe('ゼニガメ');
  });

  it('accepts ss for ß', () => {
    expect(normalizeSearch('Furnifraß')).toBe('furnifrass');
    expect(normalizeSearch('Furnifrass')).toBe('furnifrass');
  });
});
