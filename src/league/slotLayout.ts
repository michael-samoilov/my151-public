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
 * The seam runs from there to the bottom-left corner. It is "Corner, high" in
 * the partner-slot study: of the seams tried it is the one that leaves the ace
 * a partition close to the 92px it used to have the whole slot for, while
 * still giving the partner a wedge that holds a full team-cell sprite.
 */
export const SEAM_RIGHT = 56 / 204;

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

type Pt2 = Pt;

/** The part of a polygon on one side of the seam. */
function clip(poly: Pt2[], seam: [Pt, Pt], upper: boolean): Pt2[] {
  const [[xa, ya], [xb, yb]] = seam;
  const side = (p: Pt2) => {
    const v = (xb - xa) * (p[1] - ya) - (yb - ya) * (p[0] - xa);
    return upper ? v : -v;
  };
  const out: Pt2[] = [];
  poly.forEach((cur, i) => {
    const prv = poly[(i - 1 + poly.length) % poly.length];
    const sc = side(cur);
    const sp = side(prv);
    const cut = (): Pt2 => {
      const t = sp / (sp - sc);
      return [prv[0] + t * (cur[0] - prv[0]), prv[1] + t * (cur[1] - prv[1])];
    };
    if (sc >= 0) {
      if (sp < 0) out.push(cut());
      out.push(cur);
    } else if (sp >= 0) {
      out.push(cut());
    }
  });
  return out;
}

/** A polygon's area centroid. */
function centroid(poly: Pt2[]): Pt2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  poly.forEach(([px, py], i) => {
    const [qx, qy] = poly[(i + 1) % poly.length];
    const cross = px * qy - qx * py;
    a += cross;
    cx += (px + qx) * cross;
    cy += (py + qy) * cross;
  });
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Place one half's sprite on the centre of mass of its own partition.
 *
 * Its *own* partition, which is the whole point. Balancing the room left over
 * along the seam instead sounds equivalent and is not: that axis runs the
 * length of the slot, so the middle of it is the middle of the *panel*, and
 * the partner ended up there rather than in the wedge it belongs to. The
 * centroid of the wedge is in the wedge.
 *
 * What is held clear of the seam is the three *painted runs* — heading,
 * sprite, name, each centred and each its own width — and not the block that
 * contains them. That block is mostly empty at the corner that binds: the
 * heading is wide and at the top, the name narrow and centred at the bottom.
 * Holding the box kept the ace jammed into the slot's corner, well short of
 * its own centre; holding the runs lets it sit on it.
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
  const past = (px: number, py: number) => {
    const v = ((xb - xa) * (py - ya) - (yb - ya) * (px - xa)) / len;
    return upper ? -v : v;
  };
  const [tx, ty] = centroid(clip([[0, 0], [w, 0], [w, h], [0, h]], seam, upper));

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
      const score = (cx - tx) ** 2 + (cy - ty) ** 2;
      if (score < bestScore) {
        bestScore = score;
        best = { left, top, width, sprite };
      }
    }
  }
  // No fallback. A half that cannot clear the seam at this size has no honest
  // position, and returning the slot's corner instead hides that from the
  // caller sizing it.
  return best;
}

/**
 * Where a half goes when the seam cannot hold it.
 *
 * `placeHalf` returns null rather than lie about a placement that crosses the
 * seam, which is right for the card and useless for the lab: a size chosen by
 * hand is *meant* to be tried before it is known to fit, and a half that
 * answers by disappearing cannot be dragged anywhere. This puts it in its own
 * corner of the slot, which is honest about being a starting point.
 */
export function placeFree(
  w: number, h: number, sprite: number, runs: Runs, upper: boolean,
): Placed {
  const width = Math.max(sprite, runs.head[0], runs.name[0]);
  const total = runs.head[1] + sprite + runs.name[1];
  return upper
    ? { left: PAD, top: PAD, width, sprite }
    : { left: Math.max(PAD, w - PAD - width), top: Math.max(PAD, h - PAD - total), width, sprite };
}

/**
 * The largest sprite both halves can hold *and still sit evenly in*.
 *
 * Equal, because sizing each half on its own made the partner read as the
 * lesser one. The partner's triangle is the smaller partition, so it sets the
 * pair: the ace gives up its own ceiling for the two to match.
 */
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
