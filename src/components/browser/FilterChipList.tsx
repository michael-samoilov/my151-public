import { HOVER_LAYER } from '@/components/ui/hoverLayer';
import { cn } from '@/lib/utils';

interface FilterChipItem {
  id: string;
  name: string;
  color: string;
}

export function FilterChipList({
  items,
  activeId,
  onSelect,
  label,
}: {
  items: FilterChipItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  label: (item: FilterChipItem) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border',
              isActive
                ? `${HOVER_LAYER} text-white border-transparent`
                : 'bg-secondary text-secondary-foreground border-border hover:border-foreground/40'
            )}
            style={isActive ? { backgroundColor: item.color } : undefined}
          >
            {label(item)}
          </button>
        );
      })}
    </div>
  );
}
