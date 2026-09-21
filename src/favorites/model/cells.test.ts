import { describe, expect, it } from 'vitest';
import { cellKind, cellKey, parseCellKey, TYPE_AXIS, GEN_AXIS } from './cells';

describe('cellKind', () => {
  it('disables starter × legendary and both favorite × legendary cells', () => {
    expect(cellKind('starter', 'legendary', false)).toBe('disabled');
    expect(cellKind('favorite', 'legendary', false)).toBe('disabled');
    expect(cellKind('legendary', 'favorite', false)).toBe('disabled');
  });

  it('keeps gimmick × legendary as a pick', () => {
    expect(cellKind('gimmick', 'legendary', false)).toBe('pick');
  });

  it('treats legendary × legendary as a pointer', () => {
    expect(cellKind('legendary', 'legendary', false)).toBe('pointer');
  });

  it('marks an empty type×gen combo as null', () => {
    expect(cellKind('dark', 1, true)).toBe('null');
    expect(cellKind('dark', 1, false)).toBe('pick');
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
