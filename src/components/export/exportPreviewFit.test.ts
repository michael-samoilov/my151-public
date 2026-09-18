import { describe, expect, it } from 'vitest';
import {
  clampTiltToBox,
  fitScaleForTilt,
  pointerNearPreview,
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
    const cardW = box.width * scale;
    const cardH = box.height * scale;
    const projected = projectedCardSize({
      width: cardW,
      height: cardH,
      tiltXDeg: 20,
      tiltYDeg: 20,
    });
    expect(projected.width).toBeLessThanOrEqual(box.width - 8);
    expect(projected.height).toBeLessThanOrEqual(box.height - 8);
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
});
