import { TYPE_BADGE, typeBadgeFontSize } from '@/lib/typeBadgeGeometry';

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
    // platform: Canvas resolves the declared font stack, CJK fallback included, the same way the DOM does.
    fontStack = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }
  if (!fontsReadyHooked && document.fonts) {
    fontsReadyHooked = true;
    // platform: Canvas measureText reports fallback metrics until the web font loads, and a canvas never starts that load.
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

// platform: measureText's actualBoundingBox values are true ink extents; browsers disagree about fontBoundingBox values.
// platform: Kana and Hangul glyphs reach different ink extents, so one band per language comes from all its labels' envelope.
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

    // platform: Text width does not scale exactly with font size, and the error depends on the rasterizer, so the chosen size is measured again.
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
