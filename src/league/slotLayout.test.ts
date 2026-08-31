import { describe, expect, it } from 'vitest';
import { SEAM_RIGHT, STANDARD_SPRITE, placeHalf, slotSprite, type Runs } from './slotLayout';

/**
 * The slot's geometry, held to the reading it came from.
 *
 * The placement is not derived from anything, so there is nothing here to
 * check the arithmetic of. What these guard is the reading itself: the two
 * centres were measured once, on a 195 x 204 slot, and every other width the
 * card is drawn at has to keep the same layout rather than drift into its own.
 */

/** The runs on the slot the placement was read off: a phone at 393px. */
const ACE: Runs = { head: [71.6, 11.9], name: [28.2, 19.6], headFirst: true };
const PARTNER: Runs = { head: [44.8, 11.9], name: [3.4, 19.6], headFirst: false };

/** The slot that reading was made on. */
const W = 195;
const H = 204;

/** The sprite's centre, as a share of the slot. */
const centre = (
  w: number, h: number, sprite: number, runs: Runs, half: 'ace' | 'partner',
) => {
  const p = placeHalf(w, h, sprite, runs, half);
  const top = p.top + (runs.headFirst ? runs.head[1] : 0);
  return [(p.left + p.width / 2) / w, (top + p.sprite / 2) / h];
};

/** Every slot the card is drawn at, widest last. The height never moves. */
const WIDTHS = [144, 153, 162, 185, 195, 205, 243, 304];

describe('the sprite both halves get', () => {
  it('is the standard sprite on the slot it was measured on', () => {
    expect(slotSprite(W, H)).toBe(STANDARD_SPRITE);
  });

  it('never exceeds the standard, however wide the slot gets', () => {
    for (const w of WIDTHS) expect(slotSprite(w, H)).toBeLessThanOrEqual(STANDARD_SPRITE);
  });

  it('gives up size rather than room when the slot is narrow', () => {
    // 144 is the slot on a phone tall enough to skip the card's fit zoom.
    // Two standard sprites there would overlap by three quarters of an edge.
    expect(slotSprite(144, H)).toBeLessThan(STANDARD_SPRITE);
    expect(slotSprite(144, H)).toBeGreaterThan(52); // still bigger than a team cell
  });

  it('scales with the root font size, which is what the height carries', () => {
    // A desktop root font of 20px makes the same 12.75rem slot 255px tall.
    expect(slotSprite(304, 255)).toBe(Math.round((STANDARD_SPRITE * 255) / H));
  });
});

describe('where each half sits', () => {
  it('puts both sprites on the centres that were read off the lab', () => {
    const [ax, ay] = centre(W, H, STANDARD_SPRITE, ACE, 'ace');
    const [px, py] = centre(W, H, STANDARD_SPRITE, PARTNER, 'partner');
    expect(ax).toBeCloseTo(0.3001, 3);
    expect(ay).toBeCloseTo(0.3241, 3);
    expect(px).toBeCloseTo(0.6881, 3);
    expect(py).toBeCloseTo(0.6134, 3);
  });

  it('keeps those centres at every width the card is drawn at', () => {
    for (const w of WIDTHS) {
      const sprite = slotSprite(w, H);
      const [ax, ay] = centre(w, H, sprite, ACE, 'ace');
      const [px, py] = centre(w, H, sprite, PARTNER, 'partner');
      expect(ax, `ace across at ${w}`).toBeCloseTo(0.3001, 3);
      expect(ay, `ace down at ${w}`).toBeCloseTo(0.3241, 3);
      expect(px, `partner across at ${w}`).toBeCloseTo(0.6881, 3);
      expect(py, `partner down at ${w}`).toBeCloseTo(0.6134, 3);
    }
  });

  it('leaves each sprite on its own side of the seam', () => {
    for (const w of WIDTHS) {
      const sprite = slotSprite(w, H);
      const seamY = (x: number) => SEAM_RIGHT * H + (H - SEAM_RIGHT * H) * (1 - x / w);
      const [ax, ay] = centre(w, H, sprite, ACE, 'ace');
      const [px, py] = centre(w, H, sprite, PARTNER, 'partner');
      expect(ay * H, `ace at ${w}`).toBeLessThan(seamY(ax * w));
      expect(py * H, `partner at ${w}`).toBeGreaterThan(seamY(px * w));
    }
  });

  it('paints nothing outside the slot', () => {
    for (const w of WIDTHS) {
      const sprite = slotSprite(w, H);
      for (const [runs, half] of [[ACE, 'ace'], [PARTNER, 'partner']] as const) {
        const p = placeHalf(w, H, sprite, runs, half);
        const total = runs.head[1] + sprite + runs.name[1];
        expect(p.left, `${half} left at ${w}`).toBeGreaterThanOrEqual(0);
        expect(p.left + p.width, `${half} right at ${w}`).toBeLessThanOrEqual(w);
        expect(p.top, `${half} top at ${w}`).toBeGreaterThanOrEqual(0);
        expect(p.top + total, `${half} bottom at ${w}`).toBeLessThanOrEqual(H);
      }
    }
  });

  it('holds the placeholder ring clear of the seam', () => {
    // A sprite may put its corner over the seam, because that corner is its
    // own transparent margin. A drawn circle is ink the whole way round.
    for (const w of WIDTHS) {
      const sprite = slotSprite(w, H);
      const seamY = (x: number) => SEAM_RIGHT * H + (H - SEAM_RIGHT * H) * (1 - x / w);
      for (const [runs, half] of [[ACE, 'ace'], [PARTNER, 'partner']] as const) {
        const p = placeHalf(w, H, sprite, runs, half);
        const [cx, cy] = centre(w, H, sprite, runs, half);
        // The gap from the sprite's centre to the seam, square to the seam.
        const ay = SEAM_RIGHT * H;
        const gap = Math.abs(-w * (cy * H - ay) - (H - ay) * (cx * w - w)) / Math.hypot(w, H - ay);
        expect(p.ring / 2, `${half} ring at ${w}`).toBeLessThanOrEqual(gap);
        expect(p.ring, `${half} ring at ${w} is still a ring`).toBeGreaterThan(sprite * 0.3);
        expect(p.ring, `${half} ring at ${w}`).toBeLessThanOrEqual(sprite * 0.62 + 0.001);
        expect(seamY(cx * w)).toBeGreaterThan(0); // the seam is where we think
      }
    }
  });

  it('leaves the ace ring at its full size, because its half has the room', () => {
    const p = placeHalf(W, H, STANDARD_SPRITE, ACE, 'ace');
    expect(p.ring).toBeCloseTo(STANDARD_SPRITE * 0.62, 5);
  });

  it('widens the block around a long name and leaves the sprite where it is', () => {
    const long: Runs = { ...ACE, name: [110, 19.6] };
    const plain = placeHalf(W, H, STANDARD_SPRITE, ACE, 'ace');
    const wide = placeHalf(W, H, STANDARD_SPRITE, long, 'ace');
    expect(wide.width).toBe(110);
    expect(wide.left + wide.width / 2).toBeCloseTo(plain.left + plain.width / 2, 5);
  });

  it('gives up the centre rather than paint a long name outside the slot', () => {
    // A name wider than twice the ace's inset cannot be centred where the
    // sprite wants to be. Staying inside the slot wins; the sprite comes with
    // it, because the block is one stack.
    const huge: Runs = { ...ACE, name: [180, 19.6] };
    const p = placeHalf(W, H, STANDARD_SPRITE, huge, 'ace');
    expect(p.left).toBe(0);
    expect(p.left + p.width).toBeLessThanOrEqual(W);
  });
});
