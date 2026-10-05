import type { ColorName } from '@/types/pokemon';
import { colorLabel, useLocale } from '@/i18n';
import { TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { colorBadgeSvg } from './attributeBadgeSvg';

export function ColorBadge({ color, className }: { color: ColorName; className?: string }) {
  useLocale();
  return <svg viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`} className={`h-auto ${className ?? ''}`} role="img" aria-label={colorLabel(color)} data-color={color}>
    {colorBadgeSvg(color)}
  </svg>;
}
