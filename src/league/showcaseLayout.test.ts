import { describe, expect, it } from 'vitest';
import {
  ACE_SCALE, HUG_CLEAR_REM, seamThrough, seamYAt, showcase, showcaseUnit, type SeamRule,
} from './showcaseLayout';
import { SPRITE_REM } from './slotLayout';

/**
 * Pane sizes in the pane's own px, measured on the card: a tall 320px phone
 * (the narrowest pane), a 360px phone, a 390px phone, a short 320px phone
 * (squashed, so laid out wider), and a desktop half (rem 20).
 */
const PANES = [
  { name: '320 tall phone', w: 119, h: 204, rem: 16 },
  { name: '360 phone', w: 131, h: 204, rem: 16 },
  { name: '390 phone', w: 144, h: 204, rem: 16 },
  { name: '320 phone', w: 175, h: 204, rem: 16 },
  { name: 'desktop', w: 207, h: 255, rem: 20 },
];
const RULES: SeamRule[] = ['between', 'hug'];

describe('showcase', () => {
  for (const pane of PANES) {
    for (const rule of RULES) {
      const unit = SPRITE_REM * pane.rem;
      const s = showcase(pane.w, pane.h, pane.rem, unit, rule);
      const yAt = (x: number) => seamYAt(s.seam, pane.w, pane.h, x);

      it(`draws the ace at twice the partner, ${pane.name}, ${rule}`, () => {
        expect(s.ace.size).toBe(ACE_SCALE * s.partner.size);
        expect(s.partner.size).toBe(unit);
      });

      it(`keeps the seam off both squares, ${pane.name}, ${rule}`, () => {
        // The ace's bottom-right corner is its nearest point to the seam, and
        // the partner's top-left corner is the partner's. Measured square to
        // the seam, the ace keeps at least the hug clearance.
        const corner = s.ace.left + s.ace.size;
        const square = (yAt(corner) - (s.ace.top + s.ace.size)) * Math.cos(Math.PI / 6);
        expect(square).toBeGreaterThanOrEqual(HUG_CLEAR_REM * pane.rem - 1e-9);
        expect(yAt(s.partner.left)).toBeLessThan(s.partner.top);
      });

      it(`keeps the seam at 30 degrees on screen, ${pane.name}, ${rule}`, () => {
        const { x1, y1, x2, y2 } = s.seam;
        const angle = Math.atan2((y1 - y2) * pane.h, (x2 - x1) * pane.w);
        expect(angle).toBeCloseTo(Math.PI / 6, 6);
      });
    }
  }

  it('lowers the seam from where the equal pair drew it', () => {
    // The old seam ran through the pane's centre.
    for (const pane of PANES) {
      const s = showcase(pane.w, pane.h, pane.rem, SPRITE_REM * pane.rem);
      expect(seamYAt(s.seam, pane.w, pane.h, pane.w / 2)).toBeGreaterThan(pane.h / 2);
    }
  });
});

describe('showcaseUnit', () => {
  it('is one team sprite on every phone from 320px up', () => {
    for (const w of [119, 131, 144, 175]) expect(showcaseUnit(w, 16, SPRITE_REM)).toBe(52);
  });

  it('shrinks only when a 2x ace cannot fit between the pads', () => {
    expect(showcaseUnit(100, 16, SPRITE_REM)).toBe((100 - 8) / ACE_SCALE);
  });
});

describe('seamThrough', () => {
  it('leaves through the bottom edge when it runs low', () => {
    const seam = seamThrough(100, 100, { x: 10, y: 99 });
    expect(seam.y1).toBe(1);
    expect(seam.x1).toBeGreaterThan(0);
  });

  it('leaves through the top edge when it runs high', () => {
    const seam = seamThrough(100, 100, { x: 90, y: 1 });
    expect(seam.y2).toBe(0);
    expect(seam.x2).toBeLessThan(1);
  });
});
