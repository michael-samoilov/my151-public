import { useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';

interface SortOption {
  value: ViewSortOption;
  label: string;
  description: string;
}

const SORT_OPTIONS: SortOption[] = [
  {
    value: 'regional',
    label: 'Regional Dex',
    description:
      'Places each evolution line roughly as deep into your grid as its earliest member appeared in its home regional dex. Evolution lines stay bundled, and lines that were neighbors in the original dex stay adjacent.',
  },
  {
    value: 'national',
    label: 'National Dex',
    description:
      'Orders lines by national dex number, keeping evolution lines bundled and original-dex neighbors adjacent.',
  },
  {
    value: 'type',
    label: 'Type',
    description:
      'Groups by each line\'s primary type, then by national dex number within each type.',
  },
  {
    value: 'build-order',
    label: 'Build Order',
    description:
      'Mirrors your build page exactly — the order and sections you set up there.',
  },
  {
    value: 'custom',
    label: 'Custom',
    description:
      'Your own drag-to-reorder arrangement. Pick this (or just drag a line in the grid) to start from the current order and rearrange freely.',
  },
];

export function ViewSettingsPane({
  onClose,
  hideHeader = false,
}: {
  onClose: () => void;
  /** Hide the internal header (for mobile bottom sheet which has its own drag tab). */
  hideHeader?: boolean;
}) {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const setGroupSpecialAtEnd = usePokedexStore((s) => s.setViewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const setCustomOrder = usePokedexStore((s) => s.setViewCustomOrder);

  // Current visible sort (used to seed custom order when user picks Custom
  // before they've dragged anything, so nothing jumps visually).
  const currentSorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);

  const handleSelectSort = (value: ViewSortOption) => {
    if (value === 'custom' && customOrder === null) {
      setCustomOrder(currentSorted.map((p) => p.id));
    }
    setSortOption(value);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasCustom = customOrder !== null;

  const handleResetCustom = () => {
    setCustomOrder(null);
    // Fall back to a sensible base sort if the user was viewing custom
    if (sortOption === 'custom') setSortOption('regional');
  };

  return (
    <div className="flex flex-col h-full bg-background w-full">
      {/* Header */}
      {!hideHeader && (
        <div className="shrink-0 border-b">
          <div className="flex items-center justify-between px-3 py-2 h-11">
            <span className="text-sm font-semibold text-foreground">View Settings</span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Sort Order */}
        <div className="px-3 pt-3 pb-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sort Order
          </h3>
          <div className="space-y-1">
            {SORT_OPTIONS.map((opt) => {
              const selected = sortOption === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelectSort(opt.value)}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer ${
                    selected ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selected ? 'border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </span>
                    <span
                      className={`text-sm ${
                        selected ? 'text-primary font-medium' : 'text-foreground'
                      }`}
                    >
                      {opt.label}
                    </span>
                    {opt.value === 'custom' && hasCustom && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {customOrder!.length} pokemon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grouping */}
        <div className="px-3 pt-3 pb-2 border-t">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Grouping
          </h3>
          <button
            onClick={() => setGroupSpecialAtEnd(!groupSpecialAtEnd)}
            className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  groupSpecialAtEnd ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}
              >
                {groupSpecialAtEnd && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className="text-sm text-foreground">Group special Pokemon at end</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
              Sends fossils, extra starters, paradox, pseudo-legendaries, ultra beasts,
              legendaries, and mythicals to the back of the grid, each in its own run.
            </p>
            {sortOption === 'custom' && (
              <p className="text-xs text-muted-foreground/80 mt-1 ml-6 leading-snug italic">
                Does not affect Custom ordering — drag freely.
              </p>
            )}
          </button>
        </div>

        {/* Custom order management */}
        {hasCustom && (
          <div className="px-3 pt-3 pb-4 border-t">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Custom Order
            </h3>
            <p className="text-xs text-muted-foreground leading-snug px-3 mb-2">
              Created automatically when you drag. New pokemon added via the build
              page slot next to their evolution line-mates, or at the end if none are
              present.
            </p>
            <button
              onClick={handleResetCustom}
              className="w-full text-left rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              Reset custom order
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
