/**
 * Where the ace and the partner sit inside the card's split slot.
 *
 * The slot is one box with a diagonal seam through it, and each half wants its
 * sprite centred on the area centroid of its own side. Both facts depend on
 * the slot's proportions, and the slot's proportions are not fixed: the card's
 * fit zoom matches height, not width, so the slot measures about 154 x 197 on a
 * phone, 199 x 167 on a desktop and 115 x 194 at 320px. A placement solved for
 * one of those lands 45% of a sprite off centre on another, which is why this
 * is computed from the measured box rather than written down as constants.
 */

/**
 * Where the seam meets the right edge, as a fraction of the slot's height.
 *
 * This is the one number that prices the whole slot. The seam runs from here
 * to the bottom-left corner, so moving it down makes the ace's partition
 * larger and the partner's smaller — and the pair has to be the same size and
 * sit evenly in its own half, so the partner's wedge sets both. Measured on
 * the phone's slot, the largest sprite at which both halves sit within 10% of
 * even:
 *
 *     0px  corner to corner  63px
 *    14px                    57px
 *    28px  <- here           52px
 *    39px                    47px
 *    54px  "Corner, high"    40px
 *
 * 28px is where an evenly-placed pair still gets 52px each — `SPRITE_REM`, the
 * sprite a Pokemon gets in an ordinary team cell. Below that the seam reads
 * more like a straight halving; past it the sprites drop under a cell.
 */
export const SEAM_RIGHT = 28 / 204;

/** A block's far corner may cross the seam by this much, in px.
 *  That corner holds a sprite's transparent margin rather than any ink. */
const CROSS = 4;

/** Clearance from the slot's own edges. */
const PAD = 6;

export interface Runs {
  /** Heading width and height, in px. */
  head: [number, number];
  /** Name width and height, in px. */
  name: [number, number];
  /** True when the heading sits above the sprite rather than below it. */
  headFirst: boolean;
}

export interface Placed {
  /** The block's top-left, in slot pixels. */
  left: number;
  top: number;
  /** The block's width; the sprite is centred in it. */
  width: number;
  /** The sprite's edge length. */
  sprite: number;
}

type Pt = [number, number];

/**
 * Place one half so the whitespace left around its sprite reads as even.
 *
 * Not the partition's centroid. The centroid is the centre of the *whole*
 * shape, which ignores that the sprite then occupies part of it; put a sprite
 * on the centroid of a wedge and the room left over is lopsided, because the
 * wedge is not the same width at both ends. What has to come out even is the
 * space that remains.
 *
 * Two axes, and they are the seam's, not the slot's:
 *
 * - **Along the seam** — the top-right to bottom-left run, which is the pair
 *   the eye compares. From the sprite's centre, travel each way until you
 *   leave the slot; those two distances are the whitespace at its top-right
 *   and at its bottom-left, and the solver equalises them. The seam itself is
 *   parallel to this axis, so it never bounds it.
 * - **Across the seam** — the sprite sits midway between the seam on one side
 *   and the slot's own edge on the other.
 *
 * Both are subject to the three painted runs (heading, sprite, name) clearing
 * the seam, and to the block staying inside the slot.
 */
export function placeHalf(
  w: number, h: number, sprite: number, runs: Runs, upper: boolean,
  seamRight = SEAM_RIGHT,
): Placed | null {
  const seam: [Pt, Pt] = [[w, seamRight * h], [0, h]];
  const width = Math.max(sprite, runs.head[0], runs.name[0]);
  const stack: Array<[number, number]> = runs.headFirst
    ? [runs.head, [sprite, sprite], runs.name]
    : [[sprite, sprite], runs.name, runs.head];
  const offsets: number[] = [];
  let total = 0;
  for (const [, rh] of stack) {
    offsets.push(total);
    total += rh;
  }
  const spriteTop = offsets[runs.headFirst ? 1 : 0];

  const [[xa, ya], [xb, yb]] = seam;
  const len = Math.hypot(xb - xa, yb - ya);
  // Along the seam, and across it pointing into this half.
  const dx = (xb - xa) / len;
  const dy = (yb - ya) / len;
  const nx = -dy * (upper ? 1 : -1);
  const ny = dx * (upper ? 1 : -1);
  const past = (px: number, py: number) => {
    const v = ((xb - xa) * (py - ya) - (yb - ya) * (px - xa)) / len;
    return upper ? -v : v;
  };

  /** How far a ray from (px,py) travels inside the slot before leaving it. */
  const exit = (px: number, py: number, ux: number, uy: number) => {
    let t = Infinity;
    if (ux > 1e-9) t = Math.min(t, (w - px) / ux);
    if (ux < -1e-9) t = Math.min(t, -px / ux);
    if (uy > 1e-9) t = Math.min(t, (h - py) / uy);
    if (uy < -1e-9) t = Math.min(t, -py / uy);
    return t;
  };

  let best: Placed | null = null;
  let bestScore = Infinity;
  const STEP = 1;
  for (let top = PAD; top + total <= h - PAD; top += STEP) {
    for (let left = PAD; left + width <= w - PAD; left += STEP) {
      let clear = true;
      for (let i = 0; i < stack.length; i++) {
        const [rw, rh] = stack[i];
        const rx = left + (width - rw) / 2;
        const cx = upper ? rx + rw : rx;
        const cy = upper ? top + offsets[i] + rh : top + offsets[i];
        if (past(cx, cy) > CROSS) { clear = false; break; }
      }
      if (!clear) continue;
      const cx = left + width / 2;
      const cy = top + spriteTop + sprite / 2;
      // The pair the eye compares: room up the seam, room down it.
      const upRun = exit(cx, cy, -dx, -dy);
      const downRun = exit(cx, cy, dx, dy);
      // And across it: the seam on one side, the slot's edge on the other.
      const toSeam = -past(cx, cy);
      const toEdge = exit(cx, cy, -nx, -ny);
      const score = Math.abs(upRun - downRun) + Math.abs(toSeam - toEdge);
      if (score < bestScore) {
        bestScore = score;
        best = { left, top, width, sprite };
      }
    }
  }
  // No fallback. A half that cannot clear the seam at this size has no
  // honest position, and returning the slot's corner instead hides that from
  // the caller sizing it -- which is how a "fits" search convinced itself an
  // 80px sprite was fine on a seam that cannot hold 44.
  return best;
}

/** How even the room around a placed sprite is, as a fraction of the mean. */
export function balance(
  w: number, h: number, place: Placed, runs: Runs, seamRight = SEAM_RIGHT,
): { topRight: number; bottomLeft: number; skew: number } {
  const seam: [Pt, Pt] = [[w, seamRight * h], [0, h]];
  const [[xa, ya], [xb, yb]] = seam;
  const len = Math.hypot(xb - xa, yb - ya);
  const dx = (xb - xa) / len;
  const dy = (yb - ya) / len;
  const stack = runs.headFirst
    ? [runs.head[1], place.sprite, runs.name[1]]
    : [place.sprite, runs.name[1], runs.head[1]];
  const spriteTop = runs.headFirst ? stack[0] : 0;
  const cx = place.left + place.width / 2;
  const cy = place.top + spriteTop + place.sprite / 2;
  const exit = (ux: number, uy: number) => {
    let t = Infinity;
    if (ux > 1e-9) t = Math.min(t, (w - cx) / ux);
    if (ux < -1e-9) t = Math.min(t, -cx / ux);
    if (uy > 1e-9) t = Math.min(t, (h - cy) / uy);
    if (uy < -1e-9) t = Math.min(t, -cy / uy);
    return t;
  };
  const topRight = exit(-dx, -dy);
  const bottomLeft = exit(dx, dy);
  const mean = (topRight + bottomLeft) / 2;
  return { topRight, bottomLeft, skew: mean > 0 ? Math.abs(topRight - bottomLeft) / mean : 1 };
}

/**
 * The largest sprite both halves can hold *and still sit evenly in*.
 *
 * Equal, because sizing each half on its own made the partner read as the
 * lesser one. And bounded by evenness, not only by fit: the largest sprite
 * that merely fits gets pushed into the corner of its wedge, which is the
 * lopsided look this is meant to avoid. The partner's triangle is the smaller
 * partition, so it sets the pair.
 */
const SKEW_LIMIT = 0.12;

export function sharedSprite(w: number, h: number, ace: Runs, partner: Runs): number {
  const fits = (s: number) => {
    for (const [runs, upper] of [[ace, true], [partner, false]] as const) {
      const width = Math.max(s, runs.head[0], runs.name[0]);
      const total = runs.head[1] + s + runs.name[1];
      if (width + 2 * PAD > w || total + 2 * PAD > h) return false;
      const p = placeHalf(w, h, s, runs, upper);
      if (!p) return false;
      const seam: [Pt, Pt] = [[w, SEAM_RIGHT * h], [0, h]];
      const [[xa, ya], [xb, yb]] = seam;
      const len = Math.hypot(xb - xa, yb - ya);
      const stack: Array<[number, number]> = runs.headFirst
        ? [runs.head, [s, s], runs.name]
        : [[s, s], runs.name, runs.head];
      let y = 0;
      for (const [rw, rh] of stack) {
        const rx = p.left + (width - rw) / 2;
        const cx = upper ? rx + rw : rx;
        const cy = upper ? p.top + y + rh : p.top + y;
        const v = ((xb - xa) * (cy - ya) - (yb - ya) * (cx - xa)) / len;
        if ((upper ? -v : v) > CROSS + 0.5) return false;
        y += rh;
      }
      if (balance(w, h, p, runs).skew > SKEW_LIMIT) return false;
    }
    return true;
  };
  let lo = 8;
  let hi = Math.min(w, h);
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo);
}
