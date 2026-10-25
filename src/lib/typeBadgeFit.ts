import { TYPE_BADGE, typeBadgeFontSize } from '@/lib/typeBadgeGeometry';

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

const TYPE_BADGE_TEXT_WIDTH = 130;

const MIN_CONDENSE = 0.82;

const CJK_BAND_SCALE = 1.28;

function isCjkText(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/.test(text);
}

interface TypeBadgeFit {
  fontSize: number;
  baseline: number;
  scaleX: number;
}

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

interface ScriptBand {
  fontSize: number;
  baseline: number;
}

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

  const k = (TYPE_BADGE.capHeight * CJK_BAND_SCALE) / ink;
  const band: ScriptBand = {
    fontSize: probe * k,
    baseline: TYPE_BADGE.textCenterY + ((ascent - descent) / 2) * k,
  };
  bandCache.set(key, band);
  return band;
}

/** `extraEm` is drawn beside the text, not in it: a width in em of the font size. */
export function typeBadgeFit(
  label: string,
  cohort: readonly string[] = [label],
  textWidth: number = TYPE_BADGE_TEXT_WIDTH,
  extraEm = 0,
): TypeBadgeFit {
  const cacheKey = `${label} @ ${cohort.join(' ')} @ ${textWidth} @ ${extraEm}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const c = measureContext();
  if (!c) return unmeasuredFit();

  const band = scriptBand(c, cohort);
  let { fontSize, baseline } = band;

  c.font = `${TYPE_BADGE.fontWeight} ${fontSize}px ${fontStack}`;
  let scaleX = TYPE_BADGE.textScaleX;
  const natural = (c.measureText(label).width + extraEm * fontSize) * scaleX;
  if (natural > textWidth) {
    const needed = textWidth / natural;
    const condense = Math.max(needed, MIN_CONDENSE);
    scaleX *= condense;
    if (needed < condense) {
      const shrink = needed / condense;
      fontSize *= shrink;
      baseline = TYPE_BADGE.textCenterY + (baseline - TYPE_BADGE.textCenterY) * shrink;
    }

    // Re-measure at the size actually chosen, and clamp.
    //
    // The step above assumes advance width scales linearly with font size. It
    // very nearly does, and the residual is not noise to be shrugged at: text
    // is laid out in whole units at a given px size, so a word measured at 33px
    // and scaled to 30.7px is not exactly what the same word measures at 30.7px.
    // How far off depends on the platform's rasterizer, which is why Italian
    // `COLEOTTERO` fitted on one machine and came out at 101% on CI — a real
    // overflow that only one of the two Chromiums showed.
    //
    // So the width is not predicted, it is checked. One extra `measureText`
    // makes the fit exact on whatever engine is actually running.
    c.font = `${TYPE_BADGE.fontWeight} ${fontSize}px ${fontStack}`;
    const painted = c.measureText(label).width + extraEm * fontSize;
    if (painted * scaleX > textWidth) scaleX = textWidth / painted;
  }

  const fit: TypeBadgeFit = { fontSize, baseline, scaleX };
  cache.set(cacheKey, fit);
  return fit;
}

export function typeBadgeNaturalWidth(label: string, cohort: readonly string[] = [label], extraEm = 0): number | null {
  const c = measureContext();
  if (!c) return null;
  const { fontSize } = scriptBand(c, cohort);
  c.font = `${TYPE_BADGE.fontWeight} ${fontSize}px ${fontStack}`;
  return (c.measureText(label).width + extraEm * fontSize) * TYPE_BADGE.textScaleX;
}

export function typeBadgeTextWidth(text: string, fontSize: number): number {
  const c = measureContext();
  if (!c || !text) return 0;
  c.font = `${TYPE_BADGE.fontWeight} ${fontSize}px ${fontStack}`;
  return c.measureText(text).width;
}

export function typeBadgeFontStack(): string {
  measureContext();
  return fontStack || 'sans-serif';
}
