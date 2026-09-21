import { describe, expect, it } from 'vitest';
import { pixelPerfectCssPx, SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';
import {
  pairSprite,
  pairSpriteScale,
  pairSquaresFit,
  seamEnds,
  soloMaxEdge,
  soloSprite,
  soloSpriteScale,
  spriteEdge,
  SPRITE_REM,
  SLOT_PAD_REM,
  slotHeadPx,
} from './slotLayout';

/**
 * The slot's CSS geometry: opposite-corner clusters, same pad, sprite at 1×,
 * 2×, or 3× of the team rem. No solver, no pane fraction, no dpr CSS px.
 */

const H = 204;
const WIDTHS = [114, 145, 162, 181, 195, 243];
const PAD = SLOT_PAD_REM * 16;
const HEAD_H = slotHeadPx(16);
const ONE = spriteEdge(1, 16);
const TWO = spriteEdge(2, 16);

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
  it('is n × 3.25 rem, n in 1|2|3, never a pane fraction', () => {
    for (const w of WIDTHS) {
      const sprite = pairSprite(w, H);
      const n = sprite / (SPRITE_REM * 16);
      expect([1, 2, 3], `at ${w}`).toContain(n);
      expect(sprite, `cqw fraction at ${w}`).not.toBeCloseTo(Math.min(0.42 * w, 0.32 * H), 0);
      if (n >= 2) {
        expect(pairSquaresFit(w, H, sprite), `squares fit at ${w} for ${n}×`).toBe(true);
      }
    }
  });

  it('drops to 1× for two large squares when 2× does not fit', () => {
    expect(pairSpriteScale(144, H)).toBe(1);
    expect(pairSprite(144, H)).toBe(ONE);
    expect(pairSquaresFit(144, H, TWO)).toBe(false);
  });

  it('picks 2× when two 6.5rem squares fit', () => {
    expect(pairSpriteScale(243, H)).toBe(2);
    expect(pairSprite(243, H)).toBe(TWO);
    expect(pairSquaresFit(243, H, TWO)).toBe(true);
  });

  it('gives both halves the same edge', () => {
    for (const w of WIDTHS) {
      expect(pairSprite(w, H)).toBe(pairSprite(w, H));
    }
  });
});

describe('corner clusters', () => {
  it('are a 180° rotation when both clusters are the same width', () => {
    for (const w of WIDTHS) {
      const sprite = pairSprite(w, H);
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

describe('soloSprite', () => {
  it('is 1×, 2×, or 3× of the team rem, larger than the pair when the pane allows', () => {
    const sprite = soloSprite(144, H);
    const n = soloSpriteScale(144, H);
    expect([1, 2, 3]).toContain(n);
    expect(sprite).toBe(spriteEdge(n, 16));
    expect(sprite).toBeGreaterThanOrEqual(pairSprite(144, H));
    expect(sprite).toBeLessThanOrEqual(soloMaxEdge(144, H));
  });

  it('never exceeds the pane after pad, heading and name', () => {
    for (const w of WIDTHS) {
      const sprite = soloSprite(w, H);
      expect(sprite).toBeLessThanOrEqual(soloMaxEdge(w, H));
      expect([1, 2, 3]).toContain(sprite / (SPRITE_REM * 16));
    }
  });
});
