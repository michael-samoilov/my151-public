import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/**
 * CSS px for every picker sprite on this device.
 * `cssPx * dpr` equals the native bitmap, so each source pixel is one device pixel.
 */
export function pickerSpriteCssPx(dpr: number): number {
  const safe = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  return SPRITE_NATIVE / safe;
}
