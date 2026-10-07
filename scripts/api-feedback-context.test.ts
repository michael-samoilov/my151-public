import { describe, expect, it, vi } from 'vitest';
vi.mock('../api/_shared.js', () => ({ redis: {}, getClientIp: () => '127.0.0.1', isReadOnlyDeployment: () => true }));
import { sanitizeContext } from '../api/feedback';

const picker = (favorites: unknown) => sanitizeContext({ route: '/favorite-pokemon-picker', favorites });
const valid = { filled: 2, total: 257, picksFilled: 1, pointersFilled: 1, selection: { type: 'water', gen: 1 } };

describe('feedback API Picker diagnostics', () => {
  it('retains useful valid progress and coordinates while dropping raw picks and unknown fields', () => {
    expect(picker({ ...valid, fills: { 'water|1': 7 }, pokemon: [7], arbitrary: 'private' }).favorites).toEqual(valid);
  });
  it('drops diagnostic counts that are not finite, bounded integers or have inconsistent totals', () => {
    for (const bad of [NaN, Infinity, -1, 100000, 1.5, '2']) expect(picker({ ...valid, filled: bad }).favorites).toBeUndefined();
    expect(picker({ ...valid, pointersFilled: 9 }).favorites).toBeUndefined();
    expect(picker({ ...valid, total: 1 }).favorites).toBeUndefined();
    expect(picker(Array(10000).fill(valid)).favorites).toBeUndefined();
  });
  it('drops hostile coordinate values instead of storing arbitrary text', () => {
    for (const selection of [{ type: '<script>', gen: 1 }, { type: 'water', gen: 'secret' }, { type: 'water', gen: 1.5 }, { type: 'water', gen: 10 }]) {
      expect(picker({ ...valid, selection }).favorites).toEqual({ ...valid, selection: null });
    }
    expect(picker({ ...valid, selection: { type: 'gimmick', gen: 'gimmick' } }).favorites).toEqual({ ...valid, selection: { type: 'gimmick', gen: 'gimmick' } });
  });
  it('retains diagnostics from legacy preview clients', () => {
    expect(sanitizeContext({ route: '/favorite-pokemon-by-type', favorites: valid }).favorites).toEqual(valid);
  });
  it('does not accept Picker diagnostics on unrelated tools', () => {
    expect(sanitizeContext({ route: 'builder', favorites: valid }).favorites).toBeUndefined();
  });
});
