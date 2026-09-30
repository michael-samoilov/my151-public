// keeps: malformed saved picker data and unsupported form mapping cannot be fully exercised through the UI.
import { describe, expect, it } from 'vitest';
import { favoritePickerIds } from './favoritePickerBridge';

describe('favorite picker saved-data boundary', () => {
  it('ignores missing, malformed, and invalid saved shapes without throwing', () => {
    for (const raw of [null, '{', 'null', '[]', '{}', '{"state":{"fills":[]}}', '{"state":{"fills":null}}']) {
      expect(favoritePickerIds(raw).size).toBe(0);
    }
  });
  it('maps unsupported Mega and alternate forms to available species and deduplicates them', () => {
    expect([...favoritePickerIds(JSON.stringify({ state: { fills: { a: 10034, b: 6, c: 11001, d: 1 } } }))].sort((a, b) => a - b)).toEqual([1, 6, 716]);
  });
  it('keeps shifted picker identities and separates ordinary from Gigantamax Rapid Strike', () => {
    expect([...favoritePickerIds(JSON.stringify({ state: { fills: { a: 10179, b: 10180, c: 10191, d: 10227 } } }))].sort((a, b) => a - b)).toEqual([892, 10178, 10179, 10227]);
  });
  it('ignores unknown IDs and invalid values while preserving available browser forms', () => {
    expect([...favoritePickerIds(JSON.stringify({ state: { fills: { a: 10091, b: '6', c: null, d: -1, e: 999999 } } }))]).toEqual([10091]);
  });
});
