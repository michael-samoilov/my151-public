/**
 * Where the ace and the partner sit inside the card's split slot.
 *
 * The seam is the placeholder ball's own band, drawn across the whole slot: a
 * line at 30 degrees, rising to the right, through the slot's middle. Through
 * the middle is what matters — any line through the centre of a rectangle cuts
 * it into two congruent halves, so the two sides are the same shape and size
 * and neither is the lesser one. Solve one and turn it over.
 *
 * The two blocks are that 180-degree rotation of each other. The ace's heading
 * sits above its sprite and its name below; the partner's are the other way
 * up. So both sprites sit the same distance from their own labels and the same
 * distance from the seam, and — because the pair is placed to make it so — the
 * two Pokemon names share one baseline.
 *
 * Every number here is in the slot's **own** pixels. The card scales itself
 * with CSS `zoom`, so the slot's `getBoundingClientRect` is a fifth to a
 * quarter smaller than the box these placements land in. Measure with
 * `offsetWidth` and `offsetHeight`.
 */

/**
 * The seam's slope: 30 degrees, the angle the placeholder ball's band is
 * drawn at (`EmptySlotBall` rotates a horizontal band by -30 degrees).
 */
const SEAM_TAN = Math.tan(Math.PI / 6);

/** A sprite's corner may cross the seam by this much, in px.
 *  That corner holds its transparent margin rather than any ink. */
const CROSS = 4;

/** The sprite the slot gave one Pokemon before it held two: 5.75rem. */
export const STANDARD_SPRITE = 92;

/** The slot's height, which is the same on every screen: 12.75rem. */
const SLOT_H = 204;

/** A team cell, 3.25rem. Neither half goes below the card's own sprites. */
const TEAM_SPRITE = 52;

/**
 * How far a block keeps off the slot's own edge, at the standard height.
 *
 * Without it the solver puts the ace's heading hard against the top-left
 * corner and the partner's against the bottom-right, because nothing in the
 * geometry says a corner is a worse place to be than the middle. The heading
 * then reads as clipped rather than placed. Four pixels is a hair line at
 * this size — enough that the words sit inside the slot, small enough that
 * the sprite gives up almost nothing to pay for it.
 */
const EDGE = 3;

/**
 * The ball behind a chosen sprite, and the placeholder before one is chosen,
 * as shares of the sprite square.
 *
 * Both are the dex builder view page's own proportions. There a tile draws its
 * ball across the whole tile and its sprite a fifth larger, so the sprite
 * overhangs the ball; and an empty tile draws its outline at four fifths of
 * the tile. Divide each by that fifth and they are shares of the sprite.
 */
const BALL_OF_SPRITE = 1 / 1.2;
const RING_OF_SPRITE = 0.8 / 1.2;

export interface Runs {
  /** Heading width and height, in the slot's own px. */
  head: [number, number];
  /** Name width and height, in the slot's own px. */
  name: [number, number];
}

export interface Placed {
  /** The block's top-left, in the slot's own px. */
  left: number;
  top: number;
  /** The block's width; every run is centred in it. */
  width: number;
  /** The sprite's edge length. */
  sprite: number;
  /** The empty state's placeholder ball, across. */
  ring: number;
  /** The two-tone ball a chosen sprite sits on, across. */
  ball: number;
  /**
   * What the name run is offset by, in px, to meet the other half's name.
   *
   * Zero wherever the pair can be placed so the two names already line up,
   * which is most of the time. Where the slot is too short for that, the
   * sprites keep their size and the two names give half the difference each.
   */
  nameShift: number;
}

export interface Slot {
  ace: Placed;
  partner: Placed;
}

type Row = [number, number];
type Pt = [number, number];

/**
 * How far a point sits past the seam, square to it. Negative is the ace's
 * side, positive the partner's.
 */
function seamSide(w: number, h: number, x: number, y: number): number {
  return (y - h / 2 + SEAM_TAN * (x - w / 2)) / Math.hypot(1, SEAM_TAN);
}

/**
 * Where the seam meets the slot's edges, as fractions of the slot.
 *
 * The drawn line has to be given in the slot's own proportions. The SVG it
 * lives in stretches a square viewBox to fill the slot, so a line at 30
 * degrees *there* is not at 30 degrees on the screen.
 */
export function seamEnds(w: number, h: number): { x1: number; y1: number; x2: number; y2: number } {
  const dy = (SEAM_TAN * w) / 2;
  if (h / 2 + dy <= h) {
    // The seam runs off the left and right edges.
    return { x1: 0, y1: (h / 2 + dy) / h, x2: 1, y2: (h / 2 - dy) / h };
  }
  // A slot wide enough for the seam to leave through the top and bottom.
  const dx = h / 2 / SEAM_TAN;
  return { x1: (w / 2 - dx) / w, y1: 1, x2: (w / 2 + dx) / w, y2: 0 };
}

/**
 * A half's runs, top to bottom. The partner's block is the ace's turned over.
 *
 * The name is taken at the sprite's width, not its own. It is capped there
 * anyway, and using the text's real width would make the solve depend on
 * which Pokemon is in the slot — so the heading moved a few pixels the moment
 * one was chosen, and moved again when the name changed.
 */
function stack(runs: Runs, sprite: number, half: 'ace' | 'partner'): Row[] {
  const s: Row = [sprite, sprite];
  const name: Row = [sprite, runs.name[1]];
  return half === 'ace'
    ? [[...runs.head], s, name]
    : [name, s, [...runs.head]];
}

/**
 * The block's width: the sprite, or the heading when that is wider.
 *
 * The name is held to the sprite's width and truncated past it, so it never
 * widens the block. It cannot: the two names are the runs either side of the
 * seam, so a name that grows the block grows it straight into the other half.
 */
function blockWidth(sprite: number, runs: Runs): number {
  return Math.max(sprite, runs.head[0]);
}

/** The part of the slot on the ace's side of the seam. */
function aceHalf(w: number, h: number): Pt[] {
  const box: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const out: Pt[] = [];
  box.forEach((cur, i) => {
    const prv = box[(i - 1 + box.length) % box.length];
    const sc = -seamSide(w, h, cur[0], cur[1]);
    const sp = -seamSide(w, h, prv[0], prv[1]);
    if (sc >= 0) {
      if (sp < 0) out.push(cut(prv, cur, sp, sc));
      out.push(cur);
    } else if (sp >= 0) {
      out.push(cut(prv, cur, sp, sc));
    }
  });
  return out;
}

function cut(a: Pt, b: Pt, sa: number, sb: number): Pt {
  const t = sa / (sa - sb);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** A polygon's area centroid. */
function centroid(poly: Pt[]): Pt {
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
 * The largest x the ace's sprite centre may take before something crosses the
 * seam. The partner's constraints come out in the same form, because the two
 * halves are congruent, so one number covers both.
 */
function seamLimitX(w: number, h: number, sprite: number, y: number, runs: Runs, half: 'ace' | 'partner'): number {
  const rows = stack(runs, sprite, half);
  const above = rows[0][1];
  const len = Math.hypot(1, SEAM_TAN);
  let offset = 0;
  let limit = Infinity;
  for (const [rw, rh] of rows) {
    // The ace's binding corner is its run's bottom-right and the partner's
    // its top-left, and the partner's block hangs off `h - y`. Both reduce to
    // the same bound on x once `h - y` is folded out, which is why one number
    // places the pair.
    const edge = half === 'ace'
      ? y + offset + rh - sprite / 2 - above
      : y - offset + sprite / 2 + above;
    const allow = rw === sprite ? CROSS : 0;
    const room = allow * len + h / 2 + (SEAM_TAN * w) / 2 - edge - (SEAM_TAN * rw) / 2;
    limit = Math.min(limit, room / SEAM_TAN);
    offset += rh;
  }
  return limit;
}

/** Hold a value in a range, taking the low end when the range is empty. */
const hold = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Place both halves, mirrored, with their two names on one baseline.
 *
 * The baseline is what fixes the pair down the slot: put the ace's sprite
 * centre at `(h - sprite - name)/2` and the partner's, being its mirror,
 * lands with its name in exactly the same band. Where the slot is too short
 * to hold both blocks at that height the sprites keep their size — shrinking
 * them to buy an alignment is the wrong trade — and the two names take half
 * the difference each instead.
 */
export function placeSlot(w: number, h: number, ace: Runs, partner: Runs, fixed?: number, max?: number): Slot {
  const nameH = Math.max(ace.name[1], partner.name[1]);
  const headH = Math.max(ace.head[1], partner.head[1]);
  const floor = Math.round((TEAM_SPRITE / SLOT_H) * h);
  /** The edge inset, in this slot's pixels rather than the standard slot's. */
  const edge = (EDGE / SLOT_H) * h;
  /**
   * How far a name may be moved to meet the other one: a sixth of its line.
   *
   * Past a certain size the sprite's own block reaches the top of the slot
   * before its name reaches the level the pair share, and the two can only
   * meet by the names giving ground. A sixth of a line is a nudge; half a
   * line is a gap between a sprite and its name, and reads as a mistake. So
   * the sprite gives up the last few pixels instead.
   */
  // The shift budget exists only to pull the two names onto one baseline. With
  // no name (nameH 0), there is no baseline to meet, so the block is free to sit
  // where its sprite and heading want it, and the sprite is not shrunk to buy an
  // alignment that no longer matters.
  const maxShift = nameH > 0 ? nameH / 6 : Infinity;

  /** Where the ace's sprite centre goes, and what it costs the names. */
  const solve = (sprite: number) => {
    const level = (h - sprite - nameH) / 2;
    // Both blocks inside the slot, top and bottom. The ace's block reaches
    // `sprite/2 + headH` above its centre and the partner's the same below
    // its own, so one range covers the pair.
    const lo = sprite / 2 + headH + edge;
    const hi = h - sprite / 2 - nameH - Math.max(0, nameH - headH) - edge;
    const y = hold(level, lo, Math.max(lo, hi));
    const width = Math.max(blockWidth(sprite, ace), blockWidth(sprite, partner));
    const xLo = width / 2 + edge;
    const xHi = Math.min(
      w - width / 2 - edge,
      seamLimitX(w, h, sprite, y, ace, 'ace'),
      seamLimitX(w, h, sprite, y, partner, 'partner'),
    );
    const [tx] = centroid(aceHalf(w, h));
    const shift = y - level;
    return { y, x: hold(tx, xLo, xHi), shift, fits: xLo <= xHi && Math.abs(shift) <= maxShift };
  };

  // `max` caps the sprite at its own art's native size, so a slot with room to
  // spare (a nameless one) draws the sprite 1:1 rather than upscaling it past
  // 1x into a blurry fractional zoom. It binds only when the fit would exceed
  // it; a smaller slot still solves for the largest sprite that fits.
  let sprite = fixed ?? Math.round((STANDARD_SPRITE / SLOT_H) * h);
  if (max !== undefined) sprite = Math.min(sprite, max);
  if (fixed === undefined) {
    while (sprite > floor && !solve(sprite).fits) sprite -= 1;
  }
  const { x, y, shift } = solve(sprite);
  return {
    ace: place(w, h, sprite, ace, 'ace', x, y, -shift),
    partner: place(w, h, sprite, partner, 'partner', x, y, shift),
  };
}

function place(
  w: number, h: number, sprite: number, runs: Runs, half: 'ace' | 'partner',
  x: number, y: number, nameShift: number,
): Placed {
  const rows = stack(runs, sprite, half);
  const width = Math.max(sprite, runs.head[0]);
  const cx = half === 'ace' ? x : w - x;
  const cy = half === 'ace' ? y : h - y;
  return {
    left: cx - width / 2,
    top: cy - sprite / 2 - rows[0][1],
    width,
    sprite,
    ring: RING_OF_SPRITE * sprite,
    ball: BALL_OF_SPRITE * sprite,
    nameShift,
  };
}
