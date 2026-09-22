import { describe, expect, it } from 'vitest';
import {
  aabbFitsCentered,
  clampHypot,
  clampTiltToBox,
  containUnrotatedSize,
  PREVIEW_DESKTOP_MAX_HYPOT,
  PREVIEW_MOBILE_MAX_HYPOT,
  PREVIEW_SHADOW_PAD_PX,
  PREVIEW_SHADOW_PEAK,
  previewMaxHypot,
  previewShadowOpacity,
  fitCardInPreviewBox,
  fitScaleForTilt,
  pointerNearPreview,
  PREVIEW_REST_PAD,
  PREVIEW_TILT_INSET,
  paintedBoxOverflow,
  tiltInsetForRestGap,
  previewCoverRatio,
  projectedCardAabb,
  projectedCardSize,
  stableFitScale,
} from './exportPreviewFit';

describe('exportPreviewFit', () => {
  it('projects a tilted card larger than its unrotated size', () => {
    const flat = projectedCardSize({ width: 800, height: 800, tiltXDeg: 0, tiltYDeg: 0 });
    const tilted = projectedCardSize({ width: 800, height: 800, tiltXDeg: 20, tiltYDeg: 20 });
    expect(tilted.width).toBeGreaterThan(flat.width * 0.7);
    expect(tilted.height).toBeGreaterThan(flat.height * 0.7);
    expect(Math.max(tilted.width, tilted.height)).toBeGreaterThan(800);
  });

  it('keeps a max-tilt card inside the preview box', () => {
    const box = { width: 900, height: 700 };
    const scale = stableFitScale({ boxWidth: box.width, boxHeight: box.height, maxTiltDeg: 20, pad: 8 });
    expect(scale).toBeLessThan(1);
    const aabb = projectedCardAabb({
      width: box.width * scale,
      height: box.height * scale,
      tiltXDeg: 20,
      tiltYDeg: 20,
    });
    expect(aabbFitsCentered(aabb, box.width, box.height, 8)).toBe(true);
  });

  it('keeps a 10deg in-phase idle inside a phone pane without pad-48 shrink', () => {
    const box = { width: 390, height: 420 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 1.4,
      tiltDeg: 10,
      pad: PREVIEW_REST_PAD,
    });
    expect(previewCoverRatio(rest, box)).toBeGreaterThan(0.82);
    const idle = clampTiltToBox({
      tiltX: 10,
      tiltY: 10,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: PREVIEW_REST_PAD,
    });
    expect(idle.x).toBeCloseTo(10, 5);
    expect(idle.y).toBeCloseTo(10, 5);
    const aabb = projectedCardAabb({
      width: rest.width,
      height: rest.height,
      tiltXDeg: idle.x,
      tiltYDeg: idle.y,
    });
    expect(aabbFitsCentered(aabb, box.width, box.height, PREVIEW_REST_PAD)).toBe(true);
  });

  it('fills a portrait phone overlay at rest and keeps 10deg AABB inside', () => {
    const box = { width: 390, height: 420 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 0.62,
      tiltDeg: 10,
      pad: PREVIEW_REST_PAD,
    });
    expect(previewCoverRatio(rest, box)).toBeGreaterThan(0.82);
    const padded = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 0.62,
      tiltDeg: 10,
      pad: 48,
    });
    expect(previewCoverRatio(rest, box)).toBeGreaterThan(previewCoverRatio(padded, box) + 0.08);
    const idle = clampTiltToBox({
      tiltX: 10,
      tiltY: 10,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: PREVIEW_REST_PAD,
    });
    expect(idle.x).toBeCloseTo(10, 5);
    expect(idle.y).toBeCloseTo(10, 5);
    expect(
      aabbFitsCentered(
        projectedCardAabb({
          width: rest.width,
          height: rest.height,
          tiltXDeg: 10,
          tiltYDeg: 10,
        }),
        box.width,
        box.height,
        PREVIEW_REST_PAD,
      ),
    ).toBe(true);
  });

  it('keeps an 8deg idle inside a phone pane when rest is sized for that idle', () => {
    const box = { width: 390, height: 420 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 1.4,
      tiltDeg: 8,
      pad: 8,
    });
    const idle = clampTiltToBox({
      tiltX: 8,
      tiltY: 0,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: 8,
    });
    expect(idle.x).toBeCloseTo(8, 5);
    expect(idle.y).toBeCloseTo(0, 5);
    const projected = projectedCardSize({
      width: rest.width,
      height: rest.height,
      tiltXDeg: idle.x,
      tiltYDeg: idle.y,
    });
    expect(projected.width).toBeLessThanOrEqual(box.width - 16 + 0.5);
    expect(projected.height).toBeLessThanOrEqual(box.height - 16 + 0.5);
  });

  it('caps a 25deg orbit on a pane-filling landscape card', () => {
    const box = { width: 390, height: 420 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 1.4,
      tiltDeg: 0,
      pad: 16,
    });
    const raw = clampTiltToBox({
      tiltX: 25,
      tiltY: 25,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: 8,
    });
    expect(Math.hypot(raw.x, raw.y)).toBeLessThan(20);
    const projected = projectedCardSize({
      width: rest.width,
      height: rest.height,
      tiltXDeg: raw.x,
      tiltYDeg: raw.y,
    });
    expect(projected.width).toBeLessThanOrEqual(box.width - 8 + 0.5);
    expect(projected.height).toBeLessThanOrEqual(box.height - 8 + 0.5);
  });

  it('clamps an overflowing tilt back into the box', () => {
    const card = { width: 640, height: 480 };
    const box = { width: 900, height: 700 };
    const clamped = clampTiltToBox({
      tiltX: 20,
      tiltY: 20,
      cardWidth: card.width,
      cardHeight: card.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: 8,
    });
    const projected = projectedCardSize({
      width: card.width,
      height: card.height,
      tiltXDeg: clamped.x,
      tiltYDeg: clamped.y,
    });
    expect(projected.width).toBeLessThanOrEqual(box.width - 8 + 0.5);
    expect(projected.height).toBeLessThanOrEqual(box.height - 8 + 0.5);
    expect(Math.hypot(clamped.x, clamped.y)).toBeLessThanOrEqual(Math.hypot(20, 20));
  });

  it('treats a far viewport pointer as not near the preview', () => {
    const card = { left: 200, top: 80, right: 700, bottom: 580, width: 500, height: 500 };
    expect(pointerNearPreview(450, 330, card)).toBe(true);
    expect(pointerNearPreview(20, 20, card)).toBe(false);
    expect(pointerNearPreview(1200, 400, card)).toBe(false);
  });

  it('shrinks a card that would overflow at the requested tilt', () => {
    const scale = fitScaleForTilt({
      cardWidth: 1000,
      cardHeight: 1000,
      boxWidth: 800,
      boxHeight: 600,
      tiltXDeg: 18,
      tiltYDeg: 18,
      pad: 0,
    });
    expect(scale).toBeLessThan(0.8);
  });

  it('fills the box at rest much more than a max-tilt pre-shrink', () => {
    const box = { width: 896, height: 800 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 1,
      tiltDeg: 0,
      pad: 16,
    });
    const forMax = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 1,
      tiltDeg: 20,
      pad: 16,
    });
    const oldScale = stableFitScale({
      boxWidth: box.width,
      boxHeight: box.height,
      maxTiltDeg: 20,
      pad: 8,
    });
    expect(rest.width).toBeGreaterThan(forMax.width + 40);
    expect(rest.height).toBeGreaterThan(box.height * 0.78);
    expect(rest.width).toBeGreaterThan(box.width * oldScale + 40);
    expect(previewCoverRatio(rest, box)).toBeGreaterThan(0.82);
    const oldCover = previewCoverRatio(
      { width: box.width * oldScale, height: box.height * oldScale },
      box,
    );
    expect(oldCover).toBeLessThan(0.82);
  });

  it('covers the long axis of a landscape card, not the letterbox side', () => {
    const layer = { width: 896, height: 800 };
    const rest = fitCardInPreviewBox({
      boxWidth: layer.width,
      boxHeight: layer.height,
      aspect: 1.4,
      tiltDeg: 0,
      pad: 16,
    });
    expect(previewCoverRatio(rest, layer)).toBeGreaterThan(0.82);
    expect(Math.min(rest.width, rest.height) / Math.min(layer.width, layer.height)).toBeLessThan(0.82);
  });

  it('uses a 24px tilt inset when rest already has room', () => {
    expect(tiltInsetForRestGap(80)).toBe(PREVIEW_TILT_INSET);
    expect(tiltInsetForRestGap(25.5)).toBe(8);
    expect(tiltInsetForRestGap(10)).toBe(8);
  });

  it('caps combined hypot at the library 10° edge without shrinking rest', () => {
    expect(PREVIEW_DESKTOP_MAX_HYPOT).toBe(10);
    expect(PREVIEW_MOBILE_MAX_HYPOT).toBe(10);
    const corner = clampHypot(10, -10, PREVIEW_DESKTOP_MAX_HYPOT);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(10, 5);
    expect(Math.hypot(10, 0)).toBe(PREVIEW_DESKTOP_MAX_HYPOT);
    expect(previewShadowOpacity(0)).toBe(0.14);
    expect(previewShadowOpacity(PREVIEW_MOBILE_MAX_HYPOT)).toBeGreaterThan(0.36);
    expect(previewShadowOpacity(PREVIEW_MOBILE_MAX_HYPOT)).toBeLessThan(0.5);
    expect(previewShadowOpacity(PREVIEW_MOBILE_MAX_HYPOT)).toBeLessThanOrEqual(PREVIEW_SHADOW_PEAK);
    expect(PREVIEW_SHADOW_PAD_PX).toBeGreaterThanOrEqual(32);
    expect(previewMaxHypot(390)).toBe(PREVIEW_MOBILE_MAX_HYPOT);
    expect(previewMaxHypot(1280)).toBe(PREVIEW_DESKTOP_MAX_HYPOT);
    const phone = clampHypot(10, -10, PREVIEW_MOBILE_MAX_HYPOT);
    expect(Math.hypot(phone.x, phone.y)).toBeCloseTo(PREVIEW_MOBILE_MAX_HYPOT, 5);
    expect(Math.hypot(10, -10)).toBeGreaterThan(12);
    const rest = fitCardInPreviewBox({
      boxWidth: 800,
      boxHeight: 800,
      aspect: 0.55,
      tiltDeg: 10,
      pad: PREVIEW_REST_PAD,
    });
    expect(previewCoverRatio(rest, { width: 800, height: 800 })).toBeGreaterThan(0.78);
  });

  it('flags a card AABB that kisses the pane corner', () => {
    const pane = { left: 0, top: 0, right: 800, bottom: 800 };
    const kiss = { left: 0.4, top: 80, right: 707, bottom: 800.9 };
    expect(paintedBoxOverflow(kiss, pane, PREVIEW_TILT_INSET)).toBeGreaterThan(20);
    const clear = { left: 40, top: 40, right: 760, bottom: 760 };
    expect(paintedBoxOverflow(clear, pane, PREVIEW_TILT_INSET)).toBe(0);
  });

  it('clamps desktop peak tilt to a 24px pane inset without shrinking rest', () => {
    const box = { width: 800, height: 800 };
    const rest = fitCardInPreviewBox({
      boxWidth: box.width,
      boxHeight: box.height,
      aspect: 0.98,
      tiltDeg: 10,
      pad: PREVIEW_REST_PAD,
    });
    expect(previewCoverRatio(rest, box)).toBeGreaterThan(0.78);
    const loose = clampTiltToBox({
      tiltX: 10,
      tiltY: -10,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: 1,
    });
    const tight = clampTiltToBox({
      tiltX: 10,
      tiltY: -10,
      cardWidth: rest.width,
      cardHeight: rest.height,
      boxWidth: box.width,
      boxHeight: box.height,
      pad: PREVIEW_TILT_INSET,
    });
    expect(Math.hypot(tight.x, tight.y)).toBeLessThan(Math.hypot(loose.x, loose.y));
    const aabb = projectedCardAabb({
      width: rest.width,
      height: rest.height,
      tiltXDeg: tight.x,
      tiltYDeg: tight.y,
    });
    expect(aabbFitsCentered(aabb, box.width, box.height, PREVIEW_TILT_INSET)).toBe(true);
  });

  it('contains a square card on the shorter box side', () => {
    const size = containUnrotatedSize({ boxWidth: 900, boxHeight: 700, aspect: 1, pad: 0 });
    expect(size.width).toBeCloseTo(700, 0);
    expect(size.height).toBeCloseTo(700, 0);
  });
});
