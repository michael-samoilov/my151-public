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

  it('marks special columns on generation pointers', () => {
    expect(pointerMarks('favorite', 1, fills, 4)).toEqual([{ source: 'starter' }]);
    expect(pointerMarks('favorite', 1, fills, 6)).toEqual([{ source: 'gimmick' }]);
    expect(pointerMarks('favorite', 1, fills, 144)).toEqual([{ source: 'legendary' }]);
  });

  it('retains the overall favorite when its legendary source is still filled', () => {
    expect(prunePointers({ ...fills, 'favorite|favorite': 144 })['favorite|favorite']).toBe(144);
    const removed = { ...fills, 'favorite|favorite': 144 };
    delete (removed as Record<string, number>)['legendary|legendary'];
    expect(prunePointers(removed)['favorite|favorite']).toBeUndefined();
  });
});
