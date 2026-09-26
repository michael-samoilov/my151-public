import { describe, expect, it } from 'vitest';
import { pairSprite, pairSpriteScale, pairSquaresFit, spriteEdge } from './slotLayout';

/**
 * The slot's CSS geometry: opposite-corner clusters, same pad, sprite at 1×,
 * 2×, or 3× of the team rem. No solver, no pane fraction, no dpr CSS px.
 */

const H = 204;
const TWO = spriteEdge(2, 16);

describe('pairSprite', () => {
  it('picks 2× when two 6.5rem squares fit', () => {
    expect(pairSpriteScale(243, H)).toBe(2);
    expect(pairSprite(243, H)).toBe(TWO);
    expect(pairSquaresFit(243, H, TWO)).toBe(true);
  });
});
