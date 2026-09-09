import { cn } from '@/lib/utils';
import { CATEGORY_COLORS, type Move } from '../moves';

/**
 * Bulbapedia's move-category mark: the Scarlet/Violet icon on its category
 * colour in a white-bordered rounded square. `className` carries the size
 * (the TM picker's rows and the card's TM slot draw it at different scales).
 */
export function CategoryChip({ category, className }: {
  category: Move['category'];
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]',
        className ?? 'h-[1.4rem] w-[1.875rem]',
      )}
      style={{ background: CATEGORY_COLORS[category] }}
      title={category}
    >
      <img src={`/sprites/moves/${category}.png`} alt={category} className="h-auto w-[62%]" />
    </span>
  );
}
