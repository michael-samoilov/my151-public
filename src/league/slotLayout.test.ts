import { describe, expect, it } from 'vitest';
import { STANDARD_SPRITE, placeSlot, type Runs, type Slot } from './slotLayout';

/**
 * The slot's geometry: two congruent halves, one turned over.
 *
 * The seam runs corner to corner, so whatever holds for the ace has to hold
 * for the partner turned upside down. These check that it does, at every
 * width the card is drawn at — the widths are what move, since the slot is
 * always 12.75rem tall.
 */

/** The runs on a phone at 393px: "ACE POKEMON" is the widest of them. */
const ACE: Runs = { head: [71.6, 11.9], name: [40, 19.6] };
const PARTNER: Runs = { head: [44.8, 11.9], name: [40, 19.6] };

const H = 204;
/** Every slot the card is drawn at, narrowest first. */
const WIDTHS = [114, 145, 162, 181, 195, 243];
const TEAM_SPRITE = 52;

/** Each half's sprite centre, in slot px. */
function centres(slot: Slot, ace: Runs, partner: Runs) {
  return {
    ace: [
      slot.ace.left + slot.ace.width / 2,
      slot.ace.top + ace.head[1] + slot.ace.sprite / 2,
    ] as const,
    partner: [
      slot.partner.left + slot.partner.width / 2,
      slot.partner.top + partner.name[1] + slot.partner.sprite / 2,
    ] as const,
  };
}

/** How far past the seam a point sits. Positive is over it. */
const T = Math.tan(Math.PI / 6);
const past = (w: number, h: number, x: number, y: number, half: 'ace' | 'partner') => {
  const side = (y - h / 2 + T * (x - w / 2)) / Math.hypot(1, T);
  return half === 'ace' ? side : -side;
};

describe('the two halves', () => {
  it('are a rotation of each other about the slot\'s middle', () => {
    for (const w of WIDTHS) {
      const { ace, partner } = centres(placeSlot(w, H, ACE, PARTNER), ACE, PARTNER);
      expect(ace[0] + partner[0], `across at ${w}`).toBeCloseTo(w, 6);
      expect(ace[1] + partner[1], `down at ${w}`).toBeCloseTo(H, 6);
    }
  });

  it('get the same sprite, and the same two balls', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      expect(slot.ace.sprite, `sprite at ${w}`).toBe(slot.partner.sprite);
      expect(slot.ace.ring, `placeholder at ${w}`).toBe(slot.partner.ring);
      expect(slot.ace.ball, `ball at ${w}`).toBe(slot.partner.ball);
      // The sprite overhangs the ball it sits on, and the placeholder is
      // smaller again — the dex builder's proportions.
      expect(slot.ace.ball).toBeLessThan(slot.ace.sprite);
      expect(slot.ace.ring).toBeLessThan(slot.ace.ball);
    }
  });

  it('sit the same distance from their own labels', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      const { ace, partner } = centres(slot, ACE, PARTNER);
      // From the sprite's centre to the near edge of its own heading. The
      // ace's heading is above its sprite and the partner's below, so this is
      // only equal because the partner's block is the ace's turned over. The
      // old stack put the name between the partner's sprite and its heading,
      // and that half read 30px airier than the other.
      const aceGap = ace[1] - (slot.ace.top + ACE.head[1]);
      const partnerGap = (slot.partner.top + PARTNER.name[1] + slot.partner.sprite) - partner[1];
      expect(aceGap, `at ${w}`).toBeCloseTo(partnerGap, 6);
    }
  });
});

describe('the sprite', () => {
  it('comes close to the standard one where the slot has room', () => {
    // Not all the way to it. The run below the sprite — the ace's name, the
    // partner's — sits a line closer to the seam than the sprite does, and it
    // is the run that binds. Buying the last 7% back means letting ink lean
    // on the seam, which is what the sprite's transparent corner is for and
    // the name's ink is not.
    const sprite = placeSlot(243, H, ACE, PARTNER).ace.sprite;
    expect(sprite).toBeGreaterThan(STANDARD_SPRITE * 0.8);
    expect(sprite).toBeLessThanOrEqual(STANDARD_SPRITE);
  });

  it('never drops below a team cell', () => {
    for (const w of WIDTHS) {
      expect(placeSlot(w, H, ACE, PARTNER).ace.sprite, `at ${w}`)
        .toBeGreaterThanOrEqual(TEAM_SPRITE);
    }
  });

  it('follows the root font size, which is what the height carries', () => {
    // A desktop root font of 20px makes the same 12.75rem slot 255px tall,
    // and every run in it 25% bigger. The whole slot should come out scaled,
    // not reshaped.
    const k = 1.25;
    const grow = (r: Runs): Runs => ({
      head: [r.head[0] * k, r.head[1] * k],
      name: [r.name[0] * k, r.name[1] * k],
    });
    const small = placeSlot(243, H, ACE, PARTNER).ace.sprite;
    const big = placeSlot(243 * k, H * k, grow(ACE), grow(PARTNER)).ace.sprite;
    expect(big / small).toBeCloseTo(k, 1);
  });
});

describe('the two names', () => {
  it('share one baseline', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      // The ace's name is the run below its sprite, the partner's the run
      // above its own. Their boxes have to land in the same band, any shift
      // included — that is the point of placing the pair down the slot rather
      // than each half on its own.
      const aceName = slot.ace.top + ACE.head[1] + slot.ace.sprite + slot.ace.nameShift;
      const partnerName = slot.partner.top + slot.partner.nameShift;
      expect(aceName, `at ${w}`).toBeCloseTo(partnerName, 5);
    }
  });

  it('needs no shift to do it on a phone, and a sixth of a line at most', () => {
    // Past a certain sprite the ace's block reaches the top of the slot
    // before its name reaches the shared level, and the two can only meet by
    // the names giving ground. The sprite gives up the last pixels first, so
    // what is left for the names is a nudge.
    expect(placeSlot(181, H, ACE, PARTNER).ace.nameShift).toBeCloseTo(0, 5);
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      expect(Math.abs(slot.ace.nameShift), `at ${w}`).toBeLessThanOrEqual(ACE.name[1] / 6 + 0.001);
      expect(slot.ace.nameShift, `mirrored at ${w}`).toBeCloseTo(-slot.partner.nameShift, 5);
    }
  });
});

describe('against the seam', () => {
  it('lets only a sprite corner over it, and only by its transparent margin', () => {
    // 114 is the slot at a 320px viewport, where "ACE POKEMON" alone is 63%
    // of the width. There the block cannot both stay inside the slot and keep
    // off the seam; the slot's edge wins and the crossing is checked below.
    for (const w of WIDTHS.filter((v) => v > 120)) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      const rows = (p: typeof slot.ace, runs: Runs, half: 'ace' | 'partner') => {
        const order: Array<[number, number]> = half === 'ace'
          ? [runs.head, [p.sprite, p.sprite], runs.name]
          : [runs.name, [p.sprite, p.sprite], runs.head];
        let y = p.top;
        return order.map(([rw, rh]) => {
          const x = p.left + (p.width - rw) / 2;
          const corner: [number, number] = half === 'ace' ? [x + rw, y + rh] : [x, y];
          y += rh;
          return past(w, H, corner[0], corner[1], half);
        });
      };
      for (const over of rows(slot.ace, ACE, 'ace')) {
        expect(over, `an ace run at ${w}`).toBeLessThanOrEqual(4.001);
      }
      for (const over of rows(slot.partner, PARTNER, 'partner')) {
        expect(over, `a partner run at ${w}`).toBeLessThanOrEqual(4.001);
      }
    }
  });

  it('gives the slot\'s edge the last word at 320px, and no more', () => {
    const slot = placeSlot(114, H, ACE, PARTNER);
    const { ace } = centres(slot, ACE, PARTNER);
    // The sprite's own corner is what leans on the seam, and it leans by less
    // than a fifth of itself — its transparent margin covers that.
    expect(past(114, H, ace[0] + slot.ace.sprite / 2, ace[1] + slot.ace.sprite / 2, 'ace'))
      .toBeLessThan(slot.ace.sprite / 4);
    expect(slot.ace.left).toBeGreaterThanOrEqual(-0.001);
  });

  it('keeps both drawn balls clear of it', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      const { ace, partner } = centres(slot, ACE, PARTNER);
      // A sprite may cross at its corner, which is its own transparent
      // margin. A ball is ink the whole way round, so neither the one behind
      // a sprite nor the placeholder before it may touch the seam.
      for (const size of [slot.ace.ring, slot.ace.ball]) {
        expect(past(w, H, ace[0], ace[1], 'ace') + size / 2, `ace ${size} at ${w}`)
          .toBeLessThan(0);
        expect(past(w, H, partner[0], partner[1], 'partner') + size / 2,
          `partner ${size} at ${w}`).toBeLessThan(0);
      }
    }
  });
});

describe('inside the slot', () => {
  /**
   * The headings used to sit hard against the slot's own edge — the ace's on
   * the top-left corner and the partner's on the bottom-right — because
   * nothing in the geometry said a corner was a worse place to be than the
   * middle. A word touching the edge reads as clipped, so the solver keeps a
   * hair line of ground on all four sides and shrinks the sprite to pay for
   * it. Measured at the phone's own slot: 81px of sprite became 78.
   */
  it('keeps both blocks off the slot\'s edges', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      /** Three pixels at the standard height, in this slot's own pixels. */
      const edge = (3 / 204) * H - 0.001;
      for (const [p, runs, half] of [
        [slot.ace, ACE, 'ace'], [slot.partner, PARTNER, 'partner'],
      ] as const) {
        const total = runs.head[1] + p.sprite + runs.name[1];
        expect(p.left, `${half} left at ${w}`).toBeGreaterThanOrEqual(edge);
        expect(w - (p.left + p.width), `${half} right at ${w}`).toBeGreaterThanOrEqual(edge);
        expect(p.top, `${half} top at ${w}`).toBeGreaterThanOrEqual(edge);
        expect(H - (p.top + total), `${half} bottom at ${w}`).toBeGreaterThanOrEqual(edge);
      }
    }
  });

  it('paints nothing outside it', () => {
    for (const w of WIDTHS) {
      const slot = placeSlot(w, H, ACE, PARTNER);
      for (const [p, runs] of [[slot.ace, ACE], [slot.partner, PARTNER]] as const) {
        const total = runs.head[1] + p.sprite + runs.name[1];
        expect(p.left, `left at ${w}`).toBeGreaterThanOrEqual(-0.001);
        expect(p.left + p.width, `right at ${w}`).toBeLessThanOrEqual(w + 0.001);
        expect(p.top, `top at ${w}`).toBeGreaterThanOrEqual(-0.001);
        expect(p.top + total, `bottom at ${w}`).toBeLessThanOrEqual(H + 0.001);
      }
    }
  });
});
