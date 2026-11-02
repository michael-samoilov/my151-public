import { SPRITE_NATIVE } from '@/lib/usePixelPerfectSprite';

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
