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
  it('draws the overall gimmick pointer from its row and column with source badges', () => {
    const gimmickFills = {
      'gimmick|8': 888,
      'fairy|gimmick': 888,
      'steel|gimmick': 888,
      'starter|gimmick': 25,
      'legendary|gimmick': 150,
    };
    expect(pointerPool('gimmick', 'gimmick', gimmickFills)).toEqual([888, 25, 150]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 888)).toEqual([
      { source: 'gen', value: 8 },
      { source: 'type', value: 'steel' },
      { source: 'type', value: 'fairy' },
    ]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 150)).toEqual([{ source: 'legendary' }]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 25)).toEqual([{ source: 'starter' }]);
    expect(prunePointers({ ...gimmickFills, 'gimmick|gimmick': 25 })['gimmick|gimmick']).toBe(25);
  });

  it('retains the overall favorite when its legendary source is still filled', () => {
    expect(prunePointers({ ...fills, 'favorite|favorite': 144 })['favorite|favorite']).toBe(144);
    const removed = { ...fills, 'favorite|favorite': 144 };
    delete (removed as Record<string, number>)['legendary|legendary'];
    expect(prunePointers(removed)['favorite|favorite']).toBeUndefined();
  });
});
