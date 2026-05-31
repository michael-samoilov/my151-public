import { cn } from '@/lib/utils';

export interface FilterChipItem {
  id: string;
  name: string;
  color: string;
}

/**
 * A wrapped row of pill buttons for a single filter dimension (classification,
 * places, archetypes, game mechanics). The active chip is filled with its own
 * color; tapping any chip calls onSelect with its id.
 */
export function FilterChipList({
  items,
  activeId,
  onSelect,
}: {
  items: FilterChipItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
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
                ? 'text-white border-transparent'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
            )}
            style={isActive ? { backgroundColor: item.color } : undefined}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
