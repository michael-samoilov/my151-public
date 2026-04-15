import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { PageFooter } from '@/components/shared/PageFooter';

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

  // Stage changes locally — only commit on "Update & View".
  const [pendingSort, setPendingSort] = useState<ViewSortOption>(sortOption);
  const [pendingGrouping, setPendingGrouping] = useState<boolean>(groupSpecialAtEnd);
  const [pendingCustomOrder, setPendingCustomOrder] = useState<number[] | null>(customOrder);

  // Seed source: what's currently visible on the grid (reflects live store state).
  const currentSorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);

  // Close on Escape (discards any pending changes)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const hasCustomPending = pendingCustomOrder !== null;

  const handleSelectSort = (value: ViewSortOption) => {
    if (value === 'custom' && pendingCustomOrder === null) {
      setPendingCustomOrder(currentSorted.map((p) => p.id));
    }
    setPendingSort(value);
  };

  const handleToggleGrouping = () => {
    setPendingGrouping((v) => !v);
  };

  const handleResetCustom = () => {
    setPendingCustomOrder(null);
    if (pendingSort === 'custom') setPendingSort('regional');
  };

  const customOrderChanged =
    (pendingCustomOrder === null) !== (customOrder === null) ||
    (pendingCustomOrder !== null &&
      customOrder !== null &&
      (pendingCustomOrder.length !== customOrder.length ||
        pendingCustomOrder.some((id, i) => id !== customOrder[i])));

  const hasPendingChanges =
    pendingSort !== sortOption ||
    pendingGrouping !== groupSpecialAtEnd ||
    customOrderChanged;

  const handleApply = () => {
    setSortOption(pendingSort);
    setGroupSpecialAtEnd(pendingGrouping);
    setCustomOrder(pendingCustomOrder);
    onClose();
  };

  return (
    <div className="relative flex flex-col h-full bg-background w-full">
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
          <h3 className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Sort Order
          </h3>
          <div className="space-y-1">
            {SORT_OPTIONS.map((opt) => {
              const selected = pendingSort === opt.value;
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
                    {opt.value === 'custom' && hasCustomPending && (
                      <span className="ml-auto text-[0.625rem] text-muted-foreground">
                        {pendingCustomOrder!.length} pokemon
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
          <h3 className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Grouping
          </h3>
          <button
            onClick={handleToggleGrouping}
            className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  pendingGrouping ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}
              >
                {pendingGrouping && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className="text-sm text-foreground">Group special Pokemon at end</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
              Sends fossils, extra starters, paradox, pseudo-legendaries, ultra beasts,
              legendaries, and mythicals to the back of the grid, each in its own run.
            </p>
            {pendingSort === 'custom' && (
              <p className="text-xs text-muted-foreground/80 mt-1 ml-6 leading-snug italic">
                Does not affect Custom ordering — drag freely.
              </p>
            )}
          </button>
        </div>

        {/* Custom order management */}
        {hasCustomPending && (
          <div className="px-3 pt-3 pb-4 border-t">
            <h3 className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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

        <PageFooter />
        {/* Extra bottom padding so the floating button doesn't occlude the last row */}
        {hasPendingChanges && <div className="h-16" aria-hidden />}
      </div>

      {/* Floating "Update & View" button */}
      {hasPendingChanges && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={handleApply}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Update & View
          </button>
        </div>
      )}
    </div>
  );
}
