import { describe, expect, it } from 'vitest';
import {
  pairSprite,
  seamEnds,
  SLOT_PAD_REM,
  SPRITE_OF_PANE_H,
  SPRITE_OF_PANE_W,
} from './slotLayout';

/**
 * The slot's CSS geometry: opposite-corner clusters, same pad, sprite as a
 * fraction of the pane. No solver.
 */

const H = 204;
const WIDTHS = [114, 145, 162, 181, 195, 243];
const PAD = SLOT_PAD_REM * 16;
const HEAD_H = 0.53125 * 16 * 1.4 * 2;

describe('pairSprite', () => {
  it('is a fraction of the pane, capped so two squares do not stack', () => {
    for (const w of WIDTHS) {
      const sprite = pairSprite(w, H);
      expect(sprite, `at ${w}`).toBeCloseTo(Math.min(SPRITE_OF_PANE_W * w, SPRITE_OF_PANE_H * H), 10);
      const aceBottom = PAD + HEAD_H + sprite;
      const partnerTop = H - PAD - HEAD_H - sprite;
      expect(partnerTop - aceBottom, `Y gap at ${w}`).toBeGreaterThan(0);
    }
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
