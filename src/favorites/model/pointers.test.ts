import { describe, expect, it } from 'vitest';
import { pointerMarks, pointerPool, prunePointers } from './pointers';

const fills = {
  'fire|1': 4,
  'starter|1': 4,
  'gimmick|1': 6,
  'legendary|1': 144,
  'fire|favorite': 4,
  'favorite|1': 4,
  'legendary|legendary': 144,
};

describe('pointerPool', () => {
  it('includes generation, type, and overall legendary favorites in the final pointer', () => {
    expect(pointerPool('favorite', 'favorite', fills)).toEqual([4, 144]);
    expect(pointerMarks('favorite', 'favorite', fills, 4)).toEqual([
      { source: 'type', value: 'fire' },
      { source: 'gen', value: 1 },
    ]);
    expect(pointerMarks('favorite', 'favorite', fills, 144)).toEqual([{ source: 'legendary' }]);
  });

  it('marks a row pointer with its generation and a column pointer with its source', () => {
    for (const id of [4, 6, 144]) {
      expect(pointerMarks('favorite', 1, fills, id)).toEqual([{ source: 'gen', value: 1 }]);
    }
    expect(pointerMarks('fire', 'favorite', fills, 4)).toEqual([{ source: 'type', value: 'fire' }]);
  });

  it('retains the overall favorite when its legendary source is still filled', () => {
    expect(prunePointers({ ...fills, 'favorite|favorite': 144 })['favorite|favorite']).toBe(144);
    const removed = { ...fills, 'favorite|favorite': 144 };
    delete (removed as Record<string, number>)['legendary|legendary'];
    expect(prunePointers(removed)['favorite|favorite']).toBeUndefined();
  });
});
