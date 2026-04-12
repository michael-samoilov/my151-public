import type { TypeName } from '@/types/pokemon';
import { typeBadgePath } from '@/data/type-ids';

interface TypeBadgeProps {
  type: TypeName;
  className?: string;
}

export function TypeBadge({ type, className = 'h-[14px] md:h-[16px]' }: TypeBadgeProps) {
  return (
    <img
      src={typeBadgePath(type)}
      alt={type}
      className={`w-auto ${className}`}
      loading="lazy"
      draggable={false}
    />
  );
}
