// The in-game egg (Michael's reference sprite, 42x43, images/1.png), traced.
//
// Coordinates are the sprite's own continuous pixel space: pixel (x, y) covers
// [x, x+1) x [y, y+1), so a pixel's centre is (x + 0.5, y + 0.5). Every point
// below cites the pixels it comes from (c = dark crack, m = mid crack,
// t = tan shadow that marks where a crack tip fades).

/** Egg outline, fitted to the sprite's outline pixel centres (fit.py, per-row
 *  least squares): x = A sqrt(1 - Y^2)(1 + K Y), Y = (y - CY) / B. Height/width
 *  1.115 (round 1 used 1.17); the top is narrower, the widest row is below the
 *  middle, exactly as on the sprite (rows 21-25 are the widest). */
export const EGG = { cx: 21, cy: 22, a: 13.0, b: 14.5, K: 0.155 };

/**
 * The crack network, centre-lines through the crack pixels.
 * Topology on the sprite: a stem from the crown forks into a left run (A) and a
 * right run (B). A zigzags down-left and sends a short fork (C) to the left
 * outline. B forks into a down branch (B1) and a right branch (B2).
 * The stem sits on pixels x 20-21 in row 8 (centre 21.0), the egg's axis.
 */
export const CRACK_TRACE = {
  stem: [[21, 7.5], [21, 9.5]], // (20,8)c (21,8)m, (20,9)m
  A: [[21, 9.5], [19.5, 10.5], [18.5, 11.5], [18.75, 12.5], [17.5, 13.5], [16, 14.5], [14.5, 15.5], [14.5, 16.5]],
  // (19,10)c (18,11)c (18,12)m (19,12)m (17,13)c (16,14)c (15,14)m (14,15)m, tip (14,16)t
  C: [[15.5, 14.5], [14, 13.5], [13.5, 12.5], [12.8, 12.0]], // (14,13)m (13,13)m (13,12)m -> outline (12,12)
  B: [[21, 9.5], [21.5, 10.5], [22.5, 11.5], [22.6, 12.8]], // (21,10)c (22,11)c (22,12)m
  B1: [[22.6, 12.8], [23.3, 14.5], [23.3, 15.4], [22.5, 16.5], [22.5, 17.5]], // (23,13)c (23,14)c (23,15)m (22,16)m, tip (22,17)t
  B2: [[22.6, 12.8], [24.5, 13.5], [26.5, 14.5], [27.5, 15.5], [28.5, 16.5]], // (24,13)c (26,14)c (27,15)m, tip (28,16)t
};

/** Spots, from the green pixel runs (g, G, L), as ellipses [cx, cy, rx, ry]
 *  fitted to each run's inner boundary. 1, 3 and 4 have no gap pixel between
 *  the green and the outline, so they wrap round the egg: their ellipses
 *  cross the outline and only the inner arc shows. 2 is wholly inside. */
export const SPOTS = {
  s1: [10.2, 20.0, 5.8, 4.0], // rows 16-23; inner edge x 13,14,15,16,16,16,15,14
  s2: [23.0, 21.0, 2.0, 2.0], // rows 19-22, x 21-24
  s3: [30.0, 26.0, 5.0, 5.0], // rows 21-30; inner edge x 28,27,26,26,25,25,25,26,27,28
  s4: [14.0, 34.0, 4.0, 4.0], // rows 30-34; top y 30, right edge x 18
};

/** Togepi's own shell (sprite 175, rows 46-57): hollow triangles in a band,
 *  blue pointing up, red pointing down, alternating. Front view, left to
 *  right: red (wrapping the left edge), blue up, red down, blue up (lower
 *  right). Drawn here mirror-symmetric as up-down-up around the axis. */
export const TOGEPI_NOTE = 'blue ▲ (41-45, 48-53), red ▽ (47-51, 48-52), blue ▲ (45-50, 54-57), red edge (35-39, 49-55)';

// --- mapping to the 24-unit icon grid -------------------------------------
// Uniform scale: the outline's centre-line height (29 px, y 7.5-36.5) maps to
// 20 units (y 2-22), so the overlay on the sprite is exact.
export const S = 20 / 29;
export const toIcon = ([x, y]) => [12 + (x - EGG.cx) * S, 2 + (y - 7.5) * S];
export const toSprite = ([x, y]) => [EGG.cx + (x - 12) / S, 7.5 + (y - 2) / S];
