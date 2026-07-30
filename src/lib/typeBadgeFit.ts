import { TYPE_BADGE, TYPE_BADGE_H, typeBadgeFontSize } from '@/lib/typeBadgeGeometry';

/**
 * Fitting an official type name into the badge.
 *
 * The badge's geometry was measured off the English Gen IX art, and English
 * fits it with room to spare. Six of the other eight languages do not. Italian
 * `Coleottero` is the extreme — a third wider than the space reserved for it —
 * and Spanish `Fantasma` and `Eléctrico` are about a tenth over.
 *
 * The games hit exactly this wall, and it is worth being precise about how
 * they answered it, because the obvious answer is the wrong one. Through
 * Generation V, Italian shipped an abbreviated `Coleott.` — so "abbreviate"
 * looks like the official approach. It is not, any more: every game from X/Y
 * onward spells `Coleottero` in full, and Scarlet/Violet's own `typename`
 * table is where `docs/i18n/sources/scarlet-violet-typenames.json` comes from.
 * The modern badge shows the whole word. So the word is not ours to shorten,
 * and fitting it is a layout problem.
 *
 * Two things have to be solved, and they are not the same problem.
 *
 * ## Width: condense first, then shrink
 *
 * Squeezing horizontally keeps every badge's letters the same height, which is
 * what makes a grid of them look like a set — and the badge already condenses
 * to 0.76 to match the art's face. But condensing has a floor: past a point
 * the stems crowd and the word stops being a word. So the overflow is taken
 * out of the condense until that floor, and only what is left over comes out
 * of the font size. In practice that means the Spanish and French names, which
 * are barely over, are handled entirely by a squeeze nobody will notice, and
 * only `Coleottero` ends up fractionally smaller than its neighbours.
 *
 * ## Height: one band per language, never per word
 *
 * `typeBadgeGeometry.ts` explains why the badge places its baseline from a
 * fixed cap-height fraction rather than from font metrics: a flex box centres
 * the *line box*, and Latin and CJK fonts disagree about ascent and descent by
 * about 20%, so one rule puts the two scripts at visibly different heights.
 *
 * That fixed rule is right for Latin and wrong for CJK. Cap-height centring is
 * stable for Latin *because the labels are uppercase*: NORMAL and FIRE have no
 * ascenders or descenders, so every word paints the same band and one constant
 * serves them all. CJK has no cap height to centre on at all — its glyphs fill
 * the em box, which sits lower against the baseline than Latin capitals do,
 * which is why Japanese `みず` was painting its ink centre at 22.97 where the
 * art paints it at 21, hanging over the pill's bottom edge.
 *
 * So CJK has to be measured. The question is *what* to measure, and the
 * obvious answer is wrong in a way worth recording, because it looked right
 * until the numbers came back.
 *
 * Measuring each word's own ink and normalizing it to 24 units passes every
 * assertion — each badge lands dead on centre with a 24-unit band — and looks
 * bad. Japanese came out with font sizes from 22 to 28 across the eighteen
 * badges: `みず` large, `ノーマル` small, sitting side by side in the same grid.
 * The reasoning behind it was that CJK has no ascender or descender variation,
 * so every string's ink box is the same band. That is true of Han, which is
 * designed to fill the em square, and false of kana and Hangul, which do not
 * all reach the same extents — `ー` is a single horizontal bar and `ず` has a
 * tail, and normalizing each to the same height inflates one and shrinks the
 * other.
 *
 * The band belongs to the *script*, not to the word. So it is measured once
 * per language from the envelope of all eighteen labels — the greatest ascent
 * and greatest descent any of them reaches — and every badge in that language
 * is then set at one size on one baseline. That keeps the property the whole
 * design is for (one grid, one cap height) while still adapting to whichever
 * font actually resolved, which for CJK is a platform fallback we do not ship
 * and cannot predict.
 *
 * Both scripts end up painting a 24-unit band centred on 21 — an invariant a
 * test can assert in every locale, and `e2e/dev/type-badge.spec.ts` does.
 *
 * ## Measurement
 *
 * Canvas `measureText`, because `actualBoundingBoxAscent`/`Descent` are true
 * ink extents for the exact characters in the exact resolved font. Not
 * `fontBoundingBox*`, which browsers disagree about, and not `getBBox` on the
 * SVG, which returns the layout box and so says nothing about where the glyphs
 * actually sit.
 *
 * Two traps come with that, both real:
 *
 *  - Canvas never triggers font loading. `measureText` silently reports
 *    *fallback* metrics if the font has not resolved yet, and those metrics
 *    would then be cached forever. So the cache is keyed on a generation
 *    counter that `document.fonts.ready` bumps, and every fit is recomputed
 *    once the real fonts land.
 *  - The font stack is read from the live document rather than repeated here,
 *    so this cannot drift from the `body` rule in `index.css`.
 *
 * There are at most 18 labels per locale and the results are cached, so this
 * costs a few dozen microseconds once per language.
 */

/**
 * The space the word may occupy, in the badge's own 200x40 units.
 *
 * The symbol's box ends at 45 and the pill's own inset is 15, and the word is
 * anchored at 113 — so it may run 65 units left before it touches the symbol
 * and 72 right before the edge. Twice the tighter of the two, because the text
 * is centre-anchored and grows both ways.
 */
export const TYPE_BADGE_TEXT_WIDTH = 130;

/**
 * How far the condense may go past the base 0.76 before the remaining overflow
 * is taken out of the font size instead.
 *
 * 0.82 puts the absolute floor at 0.62 of natural width. Everything except
 * Italian `Coleottero` fits inside it, so in eight of nine languages the whole
 * badge set keeps one cap height.
 */
const MIN_CONDENSE = 0.82;

/** True if the string contains kana, Hangul or Han. */
export function isCjkText(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/.test(text);
}

export interface TypeBadgeFit {
  /** Font size in badge units. */
  fontSize: number;
  /** Baseline y in badge units. */
  baseline: number;
  /** Total horizontal scale, base condense included. */
  scaleX: number;
}

/** The fit a non-measuring caller gets: the English-tuned constants. */
function unmeasuredFit(): TypeBadgeFit {
  return {
    fontSize: typeBadgeFontSize(),
    baseline: TYPE_BADGE.textCenterY + TYPE_BADGE.capHeight / 2,
    scaleX: TYPE_BADGE.textScaleX,
  };
}

let cache = new Map<string, TypeBadgeFit>();
let bandCache = new Map<string, ScriptBand>();
let ctx: CanvasRenderingContext2D | null = null;
let fontStack = '';
let fontsReadyHooked = false;

function measureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  if (!fontStack) {
    // Single-sourced from the document so it cannot drift from index.css. The
    // CJK fallback is the part that matters: it is whatever the platform
    // resolves, and measuring the same declared stack in canvas resolves it
    // the same way the DOM does.
    fontStack = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  if (!fontsReadyHooked && document.fonts) {
    fontsReadyHooked = true;
    // Anything measured before the webfont resolved was measured against a
    // fallback. Throw it away rather than live with badges sized for a font
    // that is no longer on screen.
    void document.fonts.ready.then(() => {
      cache = new Map();
      bandCache = new Map();
    });
  }
  return ctx;
}

/** The size and baseline every label in one language shares. */
interface ScriptBand {
  fontSize: number;
  baseline: number;
}

/**
 * The band for a whole language, measured from the envelope of its labels.
 *
 * Latin needs no measurement: the labels are uppercase, so the cap band the
 * art was measured against is the band, and the constants in
 * `typeBadgeGeometry.ts` already carry it.
 *
 * CJK is measured, but from `cohort` rather than from any single word — see
 * the note at the top of this file for why per-word measurement produced
 * eighteen different sizes in Japanese. The greatest ascent and greatest
 * descent reached by any label define the band, so the tallest word is the one
 * that fits exactly and nothing overflows.
 */
function scriptBand(c: CanvasRenderingContext2D, cohort: readonly string[]): ScriptBand {
  const latin: ScriptBand = {
    fontSize: typeBadgeFontSize(),
    baseline: TYPE_BADGE.textCenterY + TYPE_BADGE.capHeight / 2,
  };
  if (!cohort.some(isCjkText)) return latin;

  const key = cohort.join(' ');
  const cached = bandCache.get(key);
  if (cached) return cached;

  const probe = typeBadgeFontSize();
  c.font = `${TYPE_BADGE.fontWeight} ${probe}px ${fontStack}`;
  let ascent = 0;
  let descent = 0;
  for (const label of cohort) {
    const m = c.measureText(label);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
  }
  const ink = ascent + descent;
  if (!(ink > 0)) return latin;

  // Scale the probe so the envelope is exactly the art's 24-unit band, then
  // put the baseline where that band centres on the art's optical centre.
  // `ascent` measures up from the baseline, so the baseline sits half the
  // band's own asymmetry below the target.
  const k = TYPE_BADGE.capHeight / ink;
  const band: ScriptBand = {
    fontSize: probe * k,
    baseline: TYPE_BADGE.textCenterY + ((ascent - descent) / 2) * k,
  };
  bandCache.set(key, band);
  return band;
}

/**
 * How the given label should be drawn inside the badge.
 *
 * `cohort` is every label the badge will render in the current language — all
 * eighteen type names. It is what makes the vertical band a property of the
 * language rather than of the word, so the badges in a grid share one size.
 *
 * Falls back to the English-tuned constants when there is no document to
 * measure against, so test-time or non-browser rendering still produces a
 * sensible badge rather than throwing.
 */
export function typeBadgeFit(label: string, cohort: readonly string[] = [label]): TypeBadgeFit {
  // Keyed by the cohort as well as the label. `一般` is the Normal type in both
  // Chinese locales but they can resolve to different fonts, and `Normal` is
  // shared by four Latin locales whose cohorts differ.
  const cacheKey = `${label} @ ${cohort.join(' ')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const c = measureContext();
  if (!c) return unmeasuredFit();

  const band = scriptBand(c, cohort);
  let { fontSize, baseline } = band;

  // Width. Condense as far as the floor allows, then shrink whatever is left.
  c.font = `${TYPE_BADGE.fontWeight} ${fontSize}px ${fontStack}`;
  let scaleX = TYPE_BADGE.textScaleX;
  const natural = c.measureText(label).width * scaleX;
  if (natural > TYPE_BADGE_TEXT_WIDTH) {
    const needed = TYPE_BADGE_TEXT_WIDTH / natural;
    const condense = Math.max(needed, MIN_CONDENSE);
    scaleX *= condense;
    if (needed < condense) {
      // Shrinking the size narrows the word and its band together, so the
      // baseline has to follow it back towards centre.
      const shrink = needed / condense;
      fontSize *= shrink;
      baseline = TYPE_BADGE.textCenterY + (baseline - TYPE_BADGE.textCenterY) * shrink;
    }
  }

  const fit: TypeBadgeFit = { fontSize, baseline, scaleX };
  cache.set(cacheKey, fit);
  return fit;
}

/**
 * The stack the badge's word is set in, for a caller that has to build its own
 * `font` string — the canvas exporter. Read from the document rather than
 * repeated, for the same reason the measurement is.
 */
export function typeBadgeFontStack(): string {
  measureContext();
  return fontStack || 'sans-serif';
}

/** Test seam: forget every measurement, as a font load would. */
export function resetTypeBadgeFit(): void {
  cache = new Map();
  ctx = null;
  fontStack = '';
}

/** The pill's own height, re-exported so callers need one import. */
export { TYPE_BADGE_H };
