import type { TypeName } from '@/types/pokemon';
import { typeBadgePath } from '@/data/type-ids';

interface TypeBadgeProps {
  type: TypeName;
  className?: string;
}

/**
 * Renders a Gen IX Scarlet/Violet type badge sprite.
 * Width-based sizing: pass a max-width class via className.
 * Height scales automatically to preserve the 3.2:1 aspect ratio.
 */
export function TypeBadge({ type, className }: TypeBadgeProps) {
  return (
    <img
      src={typeBadgePath(type)}
      alt={type}
      className={`h-auto ${className ?? ''}`}
      loading="lazy"
      draggable={false}
    />
  );
}
