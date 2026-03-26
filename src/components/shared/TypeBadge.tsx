import type { TypeName } from '@/types/pokemon';
import { TYPE_COLORS, TYPE_TEXT_COLORS } from '@/data/type-colors';

interface TypeBadgeProps {
  type: TypeName;
  size?: 'sm' | 'md';
}

export function TypeBadge({ type, size = 'sm' }: TypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold capitalize ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'
      }`}
      style={{
        backgroundColor: TYPE_COLORS[type],
        color: TYPE_TEXT_COLORS[type],
      }}
    >
      {type}
    </span>
  );
}
