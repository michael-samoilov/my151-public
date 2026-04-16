import type { TypeName } from '@/types/pokemon';
import { typeBadgePath } from '@/data/type-ids';

interface TypeBadgeProps {
  type: TypeName;
  className?: string;
  loading?: 'lazy' | 'eager';
}

/**
 * Renders a Gen IX Scarlet/Violet type badge sprite.
 * Width-based sizing: pass a max-width class via className.
 * Height scales automatically to preserve the 5:1 aspect ratio.
 */
export function TypeBadge({ type, className, loading = 'lazy' }: TypeBadgeProps) {
  return (
    <img
      src={typeBadgePath(type)}
      alt={type}
      width={200}
      height={40}
      className={`h-auto ${className ?? ''}`}
      loading={loading}
      draggable={false}
    />
  );
}
