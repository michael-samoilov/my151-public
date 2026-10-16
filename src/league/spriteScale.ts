import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

/**
 * How the league draws its 96px sprites on each kind of screen.
 *
 * The rule is Michael's, and it is by screen, because the three screens fail
 * pixel art in different ways:
 *
 * - `phone`: the mobile layout. The fluid squash fit, sprites pixelated.
 * - `standard`: desktop under 2 device px per CSS px (a 1080p monitor). The
 *   fluid zoom up to a 96 CSS px sprite, which is 1x there. Below 1x a
 *   pixelated sprite drops whole rows and columns of its pixels, so it is
 *   smoothed instead.
 * - `retina`: desktop at 2 or more. A 96 CSS px ceiling would be 2x, and
 *   the zoom that fits the pane lands between 1x and 2x, where every source
 *   pixel draws as an uneven block. So the league summary holds its sprites
 *   at exactly 1x, and gives up its own spacing to keep every row on screen
 *   (`homeLayout.ts`). Only when even that cannot fit does it zoom, and then
 *   it stays pixelated down to 0.75x.
 *
 * The phone and standard summaries give up the same spacing, but only once
 * their zoom reaches the fit's floor.
 */
type SpriteScreen = 'phone' | 'standard' | 'retina';

interface ScreenRule {
  homeCeilingPx: ((dpr: number) => number) | null;
  holds: 'ceiling' | 'floor';
  smoothBelow: number;
}

const RULES: Record<SpriteScreen, ScreenRule> = {
  phone: { homeCeilingPx: null, holds: 'floor', smoothBelow: 0 },
  standard: { homeCeilingPx: () => SPRITE_NATIVE, holds: 'floor', smoothBelow: 1 },
  retina: { homeCeilingPx: (dpr) => SPRITE_NATIVE / dpr, holds: 'ceiling', smoothBelow: 0.75 },
};

export function spriteScreen(desktop: boolean, dpr: number): SpriteScreen {
  if (!desktop) return 'phone';
  return dpr >= 2 ? 'retina' : 'standard';
}

export function screenRule(screen: SpriteScreen): ScreenRule {
  return RULES[screen];
}

const SCALE_EPS = 1e-3;

export function spriteRendering(screen: SpriteScreen, cssPx: number, dpr: number): 'pixelated' | 'auto' {
  const deviceScale = (cssPx * dpr) / SPRITE_NATIVE;
  return deviceScale < RULES[screen].smoothBelow - SCALE_EPS ? 'auto' : 'pixelated';
}

export const SPRITE_RENDERING_VAR = '--lg-sprite-rendering';

export const SPRITE_RENDERING = `var(${SPRITE_RENDERING_VAR}, pixelated)` as React.CSSProperties['imageRendering'];
