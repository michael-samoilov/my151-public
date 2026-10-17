import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { CATEGORY_COLORS, CATEGORY_LABEL, type Move } from '../moves';

export function CategoryChip({ category, className }: {
  category: Move['category'];
  className?: string;
}) {
  const t = useT();
  const label = t(CATEGORY_LABEL[category]);
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]',
        className ?? 'h-[1.4rem] w-[1.875rem]',
      )}
      style={{ background: CATEGORY_COLORS[category] }}
      title={label}
    >
      <img src={`/sprites/moves/${category}.png`} alt={label} width={50} height={40} className="h-auto w-[62%]" />
    </span>
  );
}
