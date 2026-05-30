import { ARCHETYPES } from '@/data/archetypes';
import { cn } from '@/lib/utils';

interface ArchetypeFilterProps {
  active: string | null;
  onSelect: (id: string | null) => void;
}

export function ArchetypeFilter({ active, onSelect }: ArchetypeFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button"
        onClick={() => onSelect(null)}
        className={cn(
          'px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
          active === null
            ? 'bg-foreground text-background'
            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
        )}
      >
        All
      </button>
      {ARCHETYPES.map((archetype) => (
        <button type="button"
          key={archetype.id}
          onClick={() => onSelect(active === archetype.id ? null : archetype.id)}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border',
            active === archetype.id
              ? 'text-white border-transparent'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent'
          )}
          style={
            active === archetype.id
              ? { backgroundColor: archetype.color }
              : undefined
          }
        >
          {archetype.name}
        </button>
      ))}
    </div>
  );
}
