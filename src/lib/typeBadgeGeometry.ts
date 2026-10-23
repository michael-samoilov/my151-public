export const TYPE_BADGE_W = 200;
export const TYPE_BADGE_H = 40;
export const TYPE_BADGE_ASPECT = TYPE_BADGE_W / TYPE_BADGE_H;

export const TYPE_BADGE = {
  radius: 19,
  glyph: 30,
  glyphCenterX: 30,
  capHeight: 24,
  capHeightRatio: 0.727,
  fontWeight: 700,
  textScaleX: 0.76,
  letterSpacing: 0,
  textCenterY: 21,
  textCenterX: 113,
} as const;

export function typeBadgeFontSize(): number {
  return TYPE_BADGE.capHeight / TYPE_BADGE.capHeightRatio;
}

export function typeBadgeGlyphBox() {
  const size = TYPE_BADGE.glyph;
  return {
    x: TYPE_BADGE.glyphCenterX - size / 2,
    y: (TYPE_BADGE_H - size) / 2,
    size,
  };
}
