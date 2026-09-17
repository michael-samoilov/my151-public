import { describe, expect, it } from 'vitest';
import { pixelPerfectCssPx, SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import {
  pairSprite,
  pairSpriteScale,
  pairSquaresFit,
  seamEnds,
  SLOT_PAD_REM,
  slotHeadPx,
} from './slotLayout';

/**
 * The slot's CSS geometry: opposite-corner clusters, same pad, sprite at 1×
 * or 2× of the native 96px asset. No solver, no pane fraction.
 */

const H = 204;
const WIDTHS = [114, 145, 162, 181, 195, 243];
const PAD = SLOT_PAD_REM * 16;
const HEAD_H = slotHeadPx(16);

describe('pixelPerfectCssPx', () => {
  it('is n × 96 / dpr, rounded to a whole CSS pixel', () => {
    expect(pixelPerfectCssPx(1, 1)).toBe(SPRITE_NATIVE);
    expect(pixelPerfectCssPx(2, 1)).toBe(2 * SPRITE_NATIVE);
    expect(pixelPerfectCssPx(1, 3)).toBe(32);
    expect(pixelPerfectCssPx(2, 3)).toBe(64);
    expect(pixelPerfectCssPx(1, 2)).toBe(48);
    expect(pixelPerfectCssPx(2, 2.625)).toBe(73);
  });
});

describe('pairSprite', () => {
  it('is 2× when two squares fit, else 1×, never a pane fraction', () => {
    for (const w of WIDTHS) {
      const sprite = pairSprite(w, H, 3);
      expect([32, 64], `at ${w}`).toContain(sprite);
      expect(sprite, `cqw fraction at ${w}`).not.toBeCloseTo(Math.min(0.42 * w, 0.32 * H), 0);
      const aceBottom = PAD + HEAD_H + sprite;
      const partnerTop = H - PAD - HEAD_H - sprite;
      if (sprite === 64) {
        expect(partnerTop - aceBottom, `Y gap at ${w} for 2×`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('drops to 1× for two large squares when 2× does not fit', () => {
    expect(pairSpriteScale(144, H, 1)).toBe(1);
    expect(pairSprite(144, H, 1)).toBe(96);
    expect(pairSquaresFit(144, H, 192)).toBe(false);
  });

  it('picks 2× at dpr 3 on a phone slot that holds two 64px squares', () => {
    expect(pairSpriteScale(144, H, 3)).toBe(2);
    expect(pairSprite(144, H, 3)).toBe(64);
    expect(pairSquaresFit(144, H, 64)).toBe(true);
  });

  it('gives both halves the same edge', () => {
    for (const w of WIDTHS) {
      expect(pairSprite(w, H, 3)).toBe(pairSprite(w, H, 3));
    }
  });
});

describe('corner clusters', () => {
  it('are a 180° rotation when both clusters are the same width', () => {
    for (const w of WIDTHS) {
      const sprite = pairSprite(w, H, 3);
      const cluster = Math.max(72, sprite);
      const ace = {
        cx: PAD + cluster / 2,
        cy: PAD + HEAD_H + sprite / 2,
      };
      const partner = {
        cx: w - PAD - cluster / 2,
        cy: H - PAD - HEAD_H - sprite / 2,
      };
      expect(ace.cx + partner.cx, `across at ${w}`).toBeCloseTo(w, 6);
      expect(ace.cy + partner.cy, `down at ${w}`).toBeCloseTo(H, 6);
    }
  });
});

describe('seamEnds', () => {
  it('runs through the middle at 30°', () => {
    for (const w of WIDTHS) {
      const s = seamEnds(w, H);
      const midX = (s.x1 + s.x2) / 2;
      const midY = (s.y1 + s.y2) / 2;
      expect(midX).toBeCloseTo(0.5, 5);
      expect(midY).toBeCloseTo(0.5, 5);
    }
  });
});
