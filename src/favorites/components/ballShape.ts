export type BallKind = 'poke' | 'ultra' | 'master';

// The balls are drawn head-on: centre (20, 20), outline r 18, seam at y 20.
// Ultra Ball: the yellow band is an H seen from above. Its legs are the ball
// cut by the planes x = ±8.5 and ±13, which show as vertical lines. Its
// crossbar runs over the top, half a leg wide, so its front edge is the
// circle r 15.75.
export const ULTRA_BAND = 'M11.5 20V6.74A15.75 15.75 0 0 1 28.5 6.74V20M7 20V7.55M33 20V7.55';
// Master Ball: each dome is the circle r 8 at 13.5 from the centre, 48° off
// vertical, where it rises past the outline. A half ellipse on the chord
// closes it. The outline skips the two chords. The M's four strokes all lean
// 22.5° off vertical, so its two peaks and its valley are equal 45° angles.
export const MASTER_OUTLINE = 'M12.82 3.49A18 18 0 0 1 27.18 3.49M37.17 14.59A18 18 0 1 1 2.83 14.59';
export const MASTER_MARKS =
  'M2.83 14.59A8 8 0 0 1 12.82 3.49A2.99 7.46 -138 0 1 2.83 14.59Z' +
  'M27.18 3.49A8 8 0 0 1 37.17 14.59A2.99 7.46 -42 0 1 27.18 3.49Z' +
  'M15.86 11.25L17.93 6.25L20 11.25L22.07 6.25L24.14 11.25';

