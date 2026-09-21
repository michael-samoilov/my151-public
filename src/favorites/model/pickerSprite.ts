import { tileImageCssPx } from '@/lib/tileImage';
import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/**
 * CSS px for every picker sprite on this viewport.
 *
 * The size is the dex image in a six-sprite row. An integer bitmap scale
 * (`n * 96 / dpr`) replaces it only when that scale is at least as large
 * and no more than 4% larger. A smaller scale, including 1×, is not used.
 */
export function pickerSpriteCssPx(dpr: number, viewportCssPx: number): number {
  const target = tileImageCssPx(viewportCssPx);
  const safe = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  for (let n = 1; n <= 4; n++) {
    const crisp = (n * SPRITE_NATIVE) / safe;
    if (crisp + 1e-6 >= target && crisp <= target * 1.04 + 1e-6) return crisp;
  }
  return target;
}
