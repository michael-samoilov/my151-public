/**
 * Where the ace and the partner sit inside the card's split slot.
 *
 * These numbers are measured, not solved. `slot-lab.html` opens the two
 * halves so a person can drag them on the real card, with the real pickers
 * and the real empty states, and read off where they put them. What follows
 * is what came back, as shares of the slot — a share is the part that
 * transfers, because the slot is 195 x 204 on the phone the reading was made
 * on, 144 x 204 on a taller phone that skips the card's fit zoom, and
 * 243 x 204 on a desktop.
 *
 * A solver stood here before and answered a different question. It sized
 * each sprite to what could clear the seam and put it on its partition's
 * centre of mass, which is a defensible layout and not the one that was
 * wanted: it made the sprites smaller than a team cell to keep a line that
 * a sprite's transparent corner may cross anyway.
 *
 * Every number here is in the slot's **own** pixels. The card scales itself
 * with CSS `zoom`, so the slot's `getBoundingClientRect` is a fifth to a
 * quarter smaller than the box these placements land in. Measuring the
 * screen box and applying the answer in the layout box is what pulled both
 * halves into the top-left corner and put the partner 18px through the seam
 * on a desktop. Measure with `offsetWidth` and `offsetHeight`.
 */

/**
 * Where the seam meets the right edge, as a share of the slot's height.
 *
 * The seam runs from there to the bottom-left corner. It is "Corner, high" in
 * the partner-slot study: of the seams tried it is the one that leaves the ace
 * a partition close to the 92px it used to have the whole slot for, while
 * still giving the partner a wedge that holds a full team-cell sprite.
 */
export const SEAM_RIGHT = 56 / 204;

/**
 * The sprite the slot gave one Pokemon before it held two: 5.75rem.
 *
 * This is what "standard size" means on this card, and it is the size both
 * halves were measured at. The slot lab starts here too.
 */
export const STANDARD_SPRITE = 92;

/** The slot's height, which is the same on every screen: 12.75rem. */
const SLOT_H = 204;

/**
 * The standard sprite as a share of the slot's height.
 *
 * The slot's height is fixed, so on all but a narrow slot this is the size
 * both halves get.
 */
const SPRITE_OF_H = STANDARD_SPRITE / SLOT_H;

/**
 * The same sprite, as a share of the slot's width.
 *
 * The height is fixed and the width is not, so a narrow slot binds first: a
 * phone tall enough to skip the fit zoom leaves the slot 144px wide, and two
 * standard sprites there would overlap by three quarters of their edge.
 * Taking the smaller of the two shares holds the overlap at the share it was
 * measured at, whatever the width.
 */
const SPRITE_OF_W = STANDARD_SPRITE / 195;

/**
 * Each sprite's centre, as a share of the slot.
 *
 * The pair is all but symmetric about the slot's middle across — 0.494, not
 * 0.500 — and sits above it down the slot, because the partner carries both
 * its name and its heading below the sprite while the ace carries only a
 * heading above. The measured pair is kept as measured rather than snapped
 * to the axis: the difference is one pixel, and a sprite's own transparent
 * margin is wider than that.
 */
const CENTRE = {
  ace: { x: 0.3001, y: 0.3241 },
  partner: { x: 0.6881, y: 0.6134 },
} as const;

export interface Runs {
  /** Heading width and height, in the slot's own px. */
  head: [number, number];
  /** Name width and height, in the slot's own px. */
  name: [number, number];
  /** True when the heading sits above the sprite rather than below it. */
  headFirst: boolean;
}

export interface Placed {
  /** The block's top-left, in the slot's own px. */
  left: number;
  top: number;
  /** The block's width; the sprite is centred in it. */
  width: number;
  /** The sprite's edge length. */
  sprite: number;
  /** The empty state's placeholder ring, across. */
  ring: number;
}

/** The edge both halves' sprites get, in the slot's own px. */
export function slotSprite(w: number, h: number): number {
  return Math.round(Math.min(SPRITE_OF_H * h, SPRITE_OF_W * w));
}

/**
 * The placeholder ring, as a share of the sprite square it stands in.
 *
 * A sprite may cross the seam at its corner, because that corner is its own
 * transparent margin. A drawn circle has no such margin — every part of it is
 * ink — so the ring is held clear of the seam instead, and this is only its
 * ceiling.
 */
const RING_OF_SPRITE = 0.62;

/** How close the ring may come to the seam, in px. */
const RING_CLEAR = 2;

/** Hold a block inside the slot. One too big for it starts at the edge. */
function fit(v: number, room: number): number {
  return Math.max(0, Math.min(v, Math.max(0, room)));
}

/**
 * Put one half's sprite on its measured centre, and stack its runs around it.
 *
 * The block is the three runs — heading, sprite, name — stacked and centred,
 * so it is as wide as the widest of them. A name longer than the sprite
 * widens the block on both sides and leaves the sprite where it is, which is
 * the point of placing the sprite rather than the block: the sprite is what
 * the eye reads the position of.
 */
export function placeHalf(
  w: number, h: number, sprite: number, runs: Runs, half: 'ace' | 'partner',
): Placed {
  const width = Math.max(sprite, runs.head[0], runs.name[0]);
  const above = runs.headFirst ? runs.head[1] : 0;
  const total = runs.head[1] + sprite + runs.name[1];
  const centre = CENTRE[half];
  return {
    left: fit(centre.x * w - width / 2, w - width),
    top: fit(centre.y * h - sprite / 2 - above, h - total),
    width,
    sprite,
    ring: Math.max(0, Math.min(
      RING_OF_SPRITE * sprite,
      2 * (seamGap(w, h, centre.x * w, centre.y * h) - RING_CLEAR),
    )),
  };
}

/** How far a point sits from the seam, square to it. */
function seamGap(w: number, h: number, x: number, y: number): number {
  const ay = SEAM_RIGHT * h;
  return Math.abs(-w * (y - ay) - (h - ay) * (x - w)) / Math.hypot(w, h - ay);
}
