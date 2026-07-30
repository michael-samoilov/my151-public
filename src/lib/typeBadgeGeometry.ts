/**
 * The type badge's proportions, in the 200x40 space the official Gen IX badge
 * art uses.
 *
 * Every number here was measured off that art rather than judged by eye —
 * `scripts/measure-badge-art.ts` reads the pixels and reports corner radius,
 * symbol box, cap height, ink centres and letter gaps, and
 * `scripts/compare-badge-render.ts` measures our rendering the same way so the
 * two can be diffed. An earlier pass of this file was eyeballed against a
 * screenshot and got the radius less than half right and the text two-thirds
 * of its proper size, which is exactly the kind of thing a screenshot hides
 * and a pixel histogram does not.
 *
 * Imported by both the React component and the canvas exporter so the two
 * cannot drift: the poster is a picture of the app, and a badge whose glyph
 * sits 2px differently in the export than on screen reads as a bug even though
 * nobody could say what changed.
 */

export const TYPE_BADGE_W = 200;
export const TYPE_BADGE_H = 40;
export const TYPE_BADGE_ASPECT = TYPE_BADGE_W / TYPE_BADGE_H;

export const TYPE_BADGE = {
  /**
   * The art measures 17-18 — close enough to a stadium (20 would be a full
   * half-height round) that the shape reads as a lozenge rather than a rounded
   * rectangle. This was 7 before anyone measured it, which is most of why the
   * drawn badge looked wrong next to the art.
   *
   * 19 rather than 17 because `rx` is not what a pixel measurement returns: the
   * curve is tangent to the top edge, so the first column with real coverage
   * appears about two units in. Calibrated by rendering 18, 19 and 20 and
   * measuring each the same way the art is measured — 19 lands on the art's
   * numbers, 20 reads as a full stadium.
   */
  radius: 19,
  /** The symbol occupies a 30x30 box whose centre is measured at (30, 20). */
  glyph: 30,
  glyphCenterX: 30,
  /**
   * Cap height, measured at 24 of 40 on every sampled badge. Expressed as the
   * target rather than as a font size, because the font size that produces it
   * depends on the font's own cap-height ratio — `capHeightRatio` below carries
   * that, measured from the rendering rather than read off a spec sheet.
   */
  capHeight: 24,
  /**
   * Inter's cap height as a fraction of em, measured by rendering. Kept beside
   * the target so `fontSize` is derived rather than hand-tuned, and so swapping
   * the font is a one-number change.
   */
  capHeightRatio: 0.727,
  /**
   * 700, measured rather than reasoned about. The condense thins vertical stems
   * without touching horizontals, so this was briefly 800 on the theory that it
   * needed to put back what the squeeze took out. Comparing ink coverage — the
   * fraction of the word's bounding box that is actually inked, which is how
   * much weight two renderings of the same word differ by — says otherwise:
   * 700 lands at 0.494 against the art's 0.489, and 800 at 0.551, which is 13%
   * too heavy. The squeeze narrows the box as well as the stems, and the two
   * largely cancel.
   */
  fontWeight: 700,
  /**
   * Horizontal scale applied to the word.
   *
   * The game sets these badges in a condensed face. Measured against the art at
   * matched cap height, Inter runs consistently wider: the reference-to-Inter
   * width ratio across NORMAL, BUG, FIRE, GRASS, ELECTRIC and DRAGON is 0.779,
   * 0.773, 0.803, 0.773, 0.808, 0.775 — a tight enough band that one factor
   * serves, rather than a per-word fudge. Trimmed from that mean to 0.76 after
   * re-measuring the condensed render, which left the longer words a few units
   * wide; every sampled word now lands within 2 units of the art.
   *
   * Inter Variable carries `wght` and `opsz` but no width axis, so this is a
   * geometric condense.
   */
  textScaleX: 0.76,
  letterSpacing: 0,
  /**
   * The centre of the text's *ink*, measured at 21.0 on every badge — a whole
   * unit below the badge's own centre, which is the kind of deliberate optical
   * offset that only shows up in a measurement.
   */
  textCenterY: 21,
  /** Mean of the sampled badges' measured text centres. */
  textCenterX: 113,
} as const;

/** Font size that renders the measured cap height in the measured font. */
export function typeBadgeFontSize(): number {
  return TYPE_BADGE.capHeight / TYPE_BADGE.capHeightRatio;
}

/**
 * Where the baseline went.
 *
 * This module used to export a `typeBadgeBaseline()` of
 * `textCenterY + capHeight / 2` — cap-height centring, and the whole reason the
 * badge is an SVG rather than a flex box. A flex box centres the *line box*,
 * whose height comes from the font's ascent and descent, and Noto CJK's are
 * ~20% taller than Inter's and disagree with its own `typo` metrics, so one
 * rule lands the two scripts at visibly different heights inside a fixed pill.
 *
 * That formula is still what Latin uses, and it still reads no font metrics.
 * It just isn't the whole answer any more: CJK has no cap height to centre on,
 * and the official Italian and Spanish names are wider than the space this
 * geometry reserves. Both are now handled in `src/lib/typeBadgeFit.ts`, which
 * owns the baseline, the size and the condense together — they interact, so
 * splitting them across two modules meant callers had to recombine them and
 * could get it subtly wrong.
 *
 * The constants above are unchanged and remain the measured record of the
 * official art. `typeBadgeFit` starts from them.
 */

/** The symbol's box, in 200x40 units. */
export function typeBadgeGlyphBox() {
  const size = TYPE_BADGE.glyph;
  return {
    x: TYPE_BADGE.glyphCenterX - size / 2,
    y: (TYPE_BADGE_H - size) / 2,
    size,
  };
}
