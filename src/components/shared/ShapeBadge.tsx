import type { ShapeName } from '@/types/pokemon';
import { shapeLabel, useLocale } from '@/i18n';
import { TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { shapeBadgeSvg } from './attributeBadgeSvg';

export function ShapeBadge({ shape, className }: { shape: ShapeName; className?: string }) {
  useLocale();
  return <svg viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`} className={`h-auto ${className ?? ''}`} role="img" aria-label={shapeLabel(shape)} data-shape={shape}>
    {shapeBadgeSvg(shape)}
  </svg>;
}
