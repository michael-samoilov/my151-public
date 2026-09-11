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
  label,
}: {
  items: FilterChipItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** The chip's display name. Supplied by the caller because the same list
   *  component serves categories and archetypes, which live in different
   *  message namespaces — `item.name` is the untranslated dataset value. */
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
                ? 'text-white border-transparent'
                : 'bg-secondary text-secondary-foreground border-transparent hover:border-foreground/25'
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
