/**
 * The type badge's proportions, in the 200x40 space the official Gen IX badge
 * art uses.
 *
 * Imported by both the React component and the canvas exporter so the two
 * cannot drift: the poster is a picture of the app, and a badge whose glyph
 * sits 2px differently in the export than on screen reads as a bug even though
 * nobody could say what changed.
 *
 * Everything is expressed in those 200x40 units. The SVG scales them via its
 * viewBox; the canvas multiplies by `height / TYPE_BADGE_H`.
 */

export const TYPE_BADGE_W = 200;
export const TYPE_BADGE_H = 40;
export const TYPE_BADGE_ASPECT = TYPE_BADGE_W / TYPE_BADGE_H;

export const TYPE_BADGE = {
  radius: 7,
  /** Left inset of the symbol, and the right inset of the text box. */
  padX: 11,
  /** The symbol is fitted into this square, preserving its aspect. */
  glyph: 28,
  /** Between the symbol's box and the text box. */
  gap: 5,
  /**
   * One size for all nine languages.
   *
   * The two extremes are Italian `Coleottero` (the longest Latin name) and
   * Japanese `フェアリー` (five full-width katakana, which is wider than any
   * Latin name despite having half the characters). Both fit the text box at
   * this size, so there is no per-locale scale to keep in sync — which matches
   * how the games do it: one fixed-width badge, with Korean simply leaving it
   * nearly half empty.
   */
  fontSize: 22,
  fontWeight: 700,
  /**
   * Baseline offset below the badge's vertical centre, in ems.
   *
   * Cap-height centring rather than line-box centring, and this is the whole
   * reason the badge is an SVG. A flex box centres the *line box*, whose height
   * comes from the font's ascent and descent — and Noto CJK's are ~20% taller
   * than Inter's and disagree with its own `typo` metrics, so the same rule
   * lands CJK and Latin text at visibly different heights inside a fixed pill.
   *
   * Capitals span 0 to ~0.727em above the baseline (Inter's cap height), so
   * their optical centre is half that up; CJK glyphs span roughly -0.12em to
   * 0.88em, centring at ~0.38em. Those are close enough that one offset serves
   * both, and it reads no font metrics at all.
   *
   * The value is tuned to land Latin capitals exactly on centre.
   * `e2e/dev/type-badge.spec.ts` measures where the ink actually falls in all
   * nine languages: Latin lands on the centre and CJK about 1.4 of 40 units
   * below it — a 3.5% difference, against the ~20% a line-box rule produces.
   */
  baselineShift: 0.364,
} as const;

/** Left edge and width of the text box, in 200x40 units. */
export function typeBadgeTextBox() {
  const left = TYPE_BADGE.padX + TYPE_BADGE.glyph + TYPE_BADGE.gap;
  const right = TYPE_BADGE_W - TYPE_BADGE.padX;
  return { left, right, width: right - left, center: (left + right) / 2 };
}

/** Baseline y for the label, in 200x40 units. */
export function typeBadgeBaseline(): number {
  return TYPE_BADGE_H / 2 + TYPE_BADGE.fontSize * TYPE_BADGE.baselineShift;
}
