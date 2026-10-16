import type { TypeName } from '@/types/pokemon';
import { typeLabel, localeUppercase, useLocale } from '@/i18n';
import { TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeSvg } from '@/components/shared/typeBadgeSvg';

export function TypeBadge({ type, className }: {
  type: TypeName;
  className?: string;
}) {
  useLocale();
  const label = localeUppercase(typeLabel(type));
  const spoken = typeLabel(type);
  return (
    <svg
      viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`}
      className={`h-auto ${className ?? ''}`}
      role="img"
      data-type={type}
      aria-label={spoken}
    >
      {typeBadgeSvg(type, label)}
    </svg>
  );
}
