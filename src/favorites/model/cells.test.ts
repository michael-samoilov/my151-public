import { describe, expect, it } from 'vitest';
import { cellKind, cellKey, parseCellKey, typeSlottedElsewhere, TYPE_AXIS, GEN_AXIS } from './cells';

describe('cellKind', () => {
  it('disables both Gimmick and Favorite intersections', () => {
    expect(cellKind('favorite', 'gimmick', false)).toBe('disabled');
    expect(cellKind('gimmick', 'favorite', false)).toBe('disabled');
    expect(cellKind('gimmick', 'gimmick', false)).toBe('pointer');
  });
  it('places legendary before gimmick on both axes', () => {
    expect(TYPE_AXIS.slice(-4)).toEqual(['starter', 'legendary', 'gimmick', 'favorite']);
    expect(GEN_AXIS.slice(-3)).toEqual(['legendary', 'gimmick', 'favorite']);
  });
  it('disables starter × legendary and both favorite × legendary cells', () => {
    expect(cellKind('starter', 'legendary', false)).toBe('disabled');
    expect(cellKind('favorite', 'legendary', false)).toBe('disabled');
    expect(cellKind('legendary', 'favorite', false)).toBe('disabled');
  });

  it('keeps only the Legendary-column, Gimmick-row intersection selectable', () => {
    expect(cellKind('gimmick', 'legendary', false)).toBe('disabled');
    expect(cellKind('legendary', 'gimmick', false)).toBe('pick');
  });

  it('treats legendary × legendary as a pointer', () => {
    expect(cellKind('legendary', 'legendary', false)).toBe('pointer');
  });

  it('marks an empty type×gen combo as null', () => {
    expect(cellKind('dark', 1, true)).toBe('null');
    expect(cellKind('dark', 1, false)).toBe('pick');
  });
});

describe('typeSlottedElsewhere', () => {
  it('returns the other type on this generation, and ignores the open cell', () => {
    const fills = { 'water|2': 184, 'fairy|2': 176, 'water|1': 184 };
    expect(typeSlottedElsewhere(fills, 184, 'fairy', 2)).toBe('water');
    expect(typeSlottedElsewhere(fills, 176, 'fairy', 2)).toBeNull();
  });
});

describe('cellKey', () => {
  it('round-trips every axis pair', () => {
    for (const type of TYPE_AXIS) {
      for (const gen of GEN_AXIS) {
        const parsed = parseCellKey(cellKey(type, gen));
        expect(parsed).toEqual({ type, gen });
      }
    }
  });
});
