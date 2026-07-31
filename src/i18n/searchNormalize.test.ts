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

  it('folds hiragana to katakana, so an unconverted IME commit still matches', () => {
    // The catalogs hold katakana. Typing ぴかちゅう and pressing Enter without
    // converting is ordinary, and used to match nothing at all.
    expect(normalizeSearch('ぴかちゅう')).toBe('ピカチュウ');
    expect(normalizeSearch('ふしぎだね')).toBe('フシギダネ');
    expect(normalizeSearch('ぜにがめ')).toBe('ゼニガメ');
  });

  it('lands every way of writing a name on the same key', () => {
    // Katakana, hiragana and half-width all converge, which is the property the
    // index depends on — it is built through this same function.
    const forms = ['ピカチュウ', 'ぴかちゅう', 'ﾋﾟｶﾁｭｳ'];
    expect(new Set(forms.map(normalizeSearch)).size).toBe(1);
  });

  it('leaves the marks katakana shares with hiragana untouched', () => {
    // ー is the prolonged-sound mark, used identically in both scripts; shifting
    // it by 0x60 would corrupt every name that contains one.
    expect(normalizeSearch('ブースター')).toBe('ブースター');
    expect(normalizeSearch('ぶーすたー')).toBe('ブースター');
  });

  it('accepts ss for ß', () => {
    // Not an accent, so decomposition never touches it — but it is the one
    // German substitution people actually type.
    expect(normalizeSearch('Furnifraß')).toBe('furnifrass');
    expect(normalizeSearch('Furnifrass')).toBe('furnifrass');
  });
});
