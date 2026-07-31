import { describe, expect, it } from 'vitest';
import { normalizeSearch } from './searchNormalize';

describe('search normalization', () => {
  it('folds Latin diacritics so accents never have to be typed', () => {
    expect(normalizeSearch('Flabébé')).toBe('flabebe');
    expect(normalizeSearch('Ténèbres')).toBe('tenebres');
    expect(normalizeSearch('Psíquico')).toBe('psiquico');
    expect(normalizeSearch('Käfer')).toBe('kafer');
  });

  it('leaves kana voicing marks alone', () => {
    // The trap this exists for: the dakuten is a combining diacritic, so a
    // blanket `\p{Diacritic}` strip turns ピカチュウ into ヒカチュウ and
    // フシギダネ into フシキタネ — names no Japanese user would ever type.
    expect(normalizeSearch('ピカチュウ')).toBe('ピカチュウ');
    expect(normalizeSearch('フシギダネ')).toBe('フシギダネ');
    expect(normalizeSearch('ゼニガメ')).toBe('ゼニガメ');
  });

  it('leaves Hangul and Han alone', () => {
    expect(normalizeSearch('피카츄')).toBe('피카츄');
    expect(normalizeSearch('妙蛙種子')).toBe('妙蛙種子');
  });

  it('folds the full-width Latin a Japanese IME produces', () => {
    expect(normalizeSearch('ＰＩＫＡ')).toBe('pika');
  });

  it('folds half-width kana to full-width, which is what the catalog holds', () => {
    expect(normalizeSearch('ﾋﾟｶﾁｭｳ')).toBe('ピカチュウ');
  });

  it('accepts ss for ß', () => {
    // Not an accent, so decomposition never touches it — but it is the one
    // German substitution people actually type.
    expect(normalizeSearch('Furnifraß')).toBe('furnifrass');
    expect(normalizeSearch('Furnifrass')).toBe('furnifrass');
  });
});
