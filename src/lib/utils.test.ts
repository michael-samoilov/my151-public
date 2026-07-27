import { describe, expect, it } from 'vitest';
import pokemonData from '@/data/pokemon.json';
import { displayName } from '@/lib/utils';

/**
 * `displayName` is slug surgery tuned to English tile widths, and the i18n work
 * replaces it with a species-name + form-descriptor lookup. These tests pin its
 * current behaviour so that swap is a deliberate, visible change rather than a
 * silent one.
 */
describe('displayName', () => {
  it('leaves ordinary species names alone', () => {
    expect(displayName('bulbasaur')).toBe('bulbasaur');
    expect(displayName('mr-mime')).toBe('mr-mime');
  });

  it('abbreviates a regional suffix', () => {
    expect(displayName('raichu-alola')).toBe('raichu-A');
    expect(displayName('yamask-galar')).toBe('yamask-G');
    expect(displayName('zorua-hisui')).toBe('zorua-H');
    expect(displayName('wooper-paldea')).toBe('wooper-P');
  });

  it('abbreviates a regional infix, keeping the trailing form', () => {
    expect(displayName('tauros-paldea-combat')).toBe('tauros-P-combat');
    expect(displayName('tauros-paldea-blaze')).toBe('tauros-P-blaze');
    expect(displayName('tauros-paldea-aqua')).toBe('tauros-P-aqua');
  });

  it('applies explicit overrides, truncated to fit a tile', () => {
    expect(displayName('urshifu-rapid-strike')).toBe('urshifu-water');
    expect(displayName('alcremie-clover')).toBe('alcremie-clovr');
    expect(displayName('alcremie-flower')).toBe('alcremie-flowr');
    expect(displayName('alcremie-ribbon')).toBe('alcremie-ribbn');
  });

  it('only suffixes a base form when showFormVariant is set', () => {
    expect(displayName('urshifu')).toBe('urshifu');
    expect(displayName('alcremie')).toBe('alcremie');
    expect(displayName('urshifu', true)).toBe('urshifu-dark');
    expect(displayName('alcremie', true)).toBe('alcremie-strwb');
  });

  it('never returns an empty label for any Pokémon in the dataset', () => {
    const empty = pokemonData
      .map((p) => ({ name: p.name, shown: displayName(p.name) }))
      .filter((r) => !r.shown.trim());
    expect(empty).toEqual([]);
  });

  it('leaves no raw region slug visible on an alt form', () => {
    const leaked = pokemonData
      .filter((p) => p.id >= 10000)
      .map((p) => displayName(p.name))
      .filter((shown) => /-(alola|galar|hisui|paldea)\b/.test(shown));
    expect(leaked).toEqual([]);
  });
});
