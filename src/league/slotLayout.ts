/**
 * Where the ace and the partner sit inside the card's split slot.
 *
 * The seam runs corner to corner, bottom-left to top-right, so the two halves
 * are congruent triangles. That is the whole reason this file is short. An
 * off-corner seam gave the partner the smaller wedge, and everything that
 * followed — a sprite sized to what the smaller half could hold, a
 * placeholder ring shrunk to clear a seam that leaned over it, a pair of
 * hand-measured centres that only held on the phone they were read on — was
 * work to hide that asymmetry. Congruent halves need none of it: solve one
 * and turn it over.
 *
 * The two blocks are a 180-degree rotation of each other about the slot's
 * middle. The ace's heading sits above its sprite and its name below; the
 * partner's are the other way up. So both sprites sit the same distance from
 * their own labels, and both are the same distance from the seam.
 *
 * Every number here is in the slot's **own** pixels. The card scales itself
 * with CSS `zoom`, so the slot's `getBoundingClientRect` is a fifth to a
 * quarter smaller than the box these placements land in. Measure with
 * `offsetWidth` and `offsetHeight`.
 */

/**
 * Where a right triangle's area is centred, along each leg.
 *
 * Each half aims for the centre of mass of its own triangle. With the seam on
 * the corner-to-corner diagonal that point is a third of the way along both
 * sides, which is also why the pair comes out symmetric for free.
 */
const CENTROID = 1 / 3;

/** A sprite's corner may cross the seam by this much, in px.
 *  That corner holds its transparent margin rather than any ink. */
const CROSS = 4;

/** The sprite the slot gave one Pokemon before it held two: 5.75rem. */
export const STANDARD_SPRITE = 92;

/** The slot's height, which is the same on every screen: 12.75rem. */
const SLOT_H = 204;

/** A team cell, 3.25rem. Neither half goes below the card's own sprites. */
const TEAM_SPRITE = 52;

/** The placeholder ring, as a share of the sprite square it stands in. */
const RING_OF_SPRITE = 0.62;

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
  /** The empty state's placeholder ring, across. */
  ring: number;
}

export interface Slot {
  ace: Placed;
  partner: Placed;
}

type Row = [number, number];

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

/** The distance a unit of `c` buys, square to the seam. */
const reach = (w: number, h: number) => (w * h) / Math.hypot(w, h);

/**
 * The largest share `c` that keeps every one of a half's runs off the seam.
 *
 * The ace sits at `(c·w, c·h)` and the partner at `((1-c)·w, (1-c)·h)`, so one
 * number places both. Each run's binding corner — bottom-right for the ace,
 * top-left for the partner — has to stay on its own side, and the two forms
 * come out the same because the halves are congruent.
 */
function seamLimit(w: number, h: number, sprite: number, runs: Runs, half: 'ace' | 'partner'): number {
  const rows = stack(runs, sprite, half);
  const above = rows[0][1];
  const k = reach(w, h);
  let offset = 0;
  let limit = Infinity;
  for (const [rw, rh] of rows) {
    const edge = half === 'ace'
      ? offset + rh - sprite / 2 - above
      : -(offset - sprite / 2 - above);
    const allow = rw === sprite ? CROSS : 0;
    limit = Math.min(limit, (1 - rw / (2 * w) - edge / h + allow / k) / 2);
    offset += rh;
  }
  return limit;
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

/** The smallest share `c` that keeps a half's block inside the slot. */
function insideLimit(w: number, h: number, sprite: number, runs: Runs): number {
  // The heading is the outer run in both halves — above the ace's sprite,
  // below the partner's — so it is what the slot's edge has to clear.
  return Math.max(blockWidth(sprite, runs) / (2 * w), (sprite / 2 + runs.head[1]) / h);
}

/**
 * Place both halves, mirrored.
 *
 * The sprite is the standard one, given up a pixel at a time only while the
 * slot is too narrow to seat two of them clear of the seam, and never below a
 * team cell — a slot that cannot hold the card's own sprite size is a slot
 * whose sprites read as smaller than the team under them, which is the
 * complaint this geometry replaced.
 */
export function placeSlot(w: number, h: number, ace: Runs, partner: Runs, fixed?: number): Slot {
  const bounds = (sprite: number) => ({
    lo: Math.max(insideLimit(w, h, sprite, ace), insideLimit(w, h, sprite, partner)),
    hi: Math.min(seamLimit(w, h, sprite, ace, 'ace'), seamLimit(w, h, sprite, partner, 'partner')),
  });
  const floor = Math.round((TEAM_SPRITE / SLOT_H) * h);
  let sprite = fixed ?? Math.round((STANDARD_SPRITE / SLOT_H) * h);
  if (fixed === undefined) {
    while (sprite > floor) {
      const { lo, hi } = bounds(sprite);
      if (lo <= hi) break;
      sprite -= 1;
    }
  }
  const { lo, hi } = bounds(sprite);
  // As close to the centre of its own triangle as the seam allows, then held
  // inside the slot. When those two disagree the slot's edge wins: a run that
  // leaves the box is worse than one that leans on the seam.
  const c = Math.max(lo, Math.min(CENTROID, hi));
  return {
    ace: place(w, h, sprite, ace, 'ace', c),
    partner: place(w, h, sprite, partner, 'partner', c),
  };
}

function place(
  w: number, h: number, sprite: number, runs: Runs, half: 'ace' | 'partner', c: number,
): Placed {
  const rows = stack(runs, sprite, half);
  const width = blockWidth(sprite, runs);
  const share = half === 'ace' ? c : 1 - c;
  return {
    left: share * w - width / 2,
    top: share * h - sprite / 2 - rows[0][1],
    width,
    sprite,
    ring: RING_OF_SPRITE * sprite,
  };
}
