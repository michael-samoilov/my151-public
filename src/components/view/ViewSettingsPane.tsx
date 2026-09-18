import { useEffect, useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { PageFooter } from '@/components/shared/PageFooter';
import { useT, type MessageKey } from '@/i18n';


/** Sort modes. Only the ids live here now — label and description come from
 *  the catalog, keyed by id, so they can be translated. */
const SORT_VALUES = ['build-order', 'regional', 'national', 'type', 'custom'] as const satisfies readonly ViewSortOption[];

const SORT_KEYS = {
  'build-order': { label: 'sort.build-order', desc: 'sort.build-order.desc' },
  regional: { label: 'sort.regional', desc: 'sort.regional.desc' },
  national: { label: 'sort.national', desc: 'sort.national.desc' },
  type: { label: 'sort.type', desc: 'sort.type.desc' },
  custom: { label: 'sort.custom', desc: 'sort.custom.desc' },
} as const satisfies Record<(typeof SORT_VALUES)[number], { label: MessageKey; desc: MessageKey }>;

export function ViewSettingsPane({
  onClose,
  mobileSheet = false,
}: {
  onClose: () => void;
  /** Mobile bottom-sheet mode: hide the internal header (the sheet has its
   *  own drag tab) and stage changes behind an explicit "Update & View"
   *  button. Desktop side-pane mode (the default) applies changes live as
   *  the user toggles options — the grid is visible in the other pane, so
   *  waiting for a commit step is friction without payoff. */
  mobileSheet?: boolean;
}) {
  const t = useT();
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const setGroupSpecialAtEnd = usePokedexStore((s) => s.setViewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const setCustomOrder = usePokedexStore((s) => s.setViewCustomOrder);
  const showSections = usePokedexStore((s) => s.viewShowSections);
  const setShowSections = usePokedexStore((s) => s.setViewShowSections);

  // Pending state is only used in mobileSheet mode. In desktop mode handlers
  // write straight to the store and the pending setters go unused.
  const [pendingSort, setPendingSort] = useState<ViewSortOption>(sortOption);
  const [pendingGrouping, setPendingGrouping] = useState<boolean>(groupSpecialAtEnd);
  const [pendingCustomOrder, setPendingCustomOrder] = useState<number[] | null>(customOrder);
  const [pendingShowSections, setPendingShowSections] = useState<boolean>(showSections);

  // Effective values — what the UI reads to render current selection state.
  // Desktop: live store values. Mobile: pending staged values.
  const effSort = mobileSheet ? pendingSort : sortOption;
  const effGrouping = mobileSheet ? pendingGrouping : groupSpecialAtEnd;
  const effCustomOrder = mobileSheet ? pendingCustomOrder : customOrder;
  const effShowSections = mobileSheet ? pendingShowSections : showSections;

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

  const hasCustomEffective = effCustomOrder !== null;

  const handleSelectSort = (value: ViewSortOption) => {
    // Picking "Custom" without an existing order seeds it from the current
    // on-screen sort, so the user has something to drag-rearrange.
    const needsSeed = value === 'custom' && effCustomOrder === null;
    const seed = needsSeed ? currentSorted.map((p) => p.id) : null;

    if (mobileSheet) {
      if (seed) setPendingCustomOrder(seed);
      setPendingSort(value);
    } else {
      if (seed) setCustomOrder(seed);
      setSortOption(value);
    }
  };

  const handleToggleGrouping = () => {
    if (mobileSheet) setPendingGrouping((v) => !v);
    else setGroupSpecialAtEnd(!groupSpecialAtEnd);
  };

  const handleToggleSections = () => {
    if (mobileSheet) setPendingShowSections((v) => !v);
    else setShowSections(!showSections);
  };

  const handleResetCustom = () => {
    if (mobileSheet) {
      setPendingCustomOrder(null);
      if (pendingSort === 'custom') setPendingSort('build-order');
    } else {
      setCustomOrder(null);
      if (sortOption === 'custom') setSortOption('build-order');
    }
  };

  const customOrderChanged =
    (pendingCustomOrder === null) !== (customOrder === null) ||
    (pendingCustomOrder !== null &&
      customOrder !== null &&
      (pendingCustomOrder.length !== customOrder.length ||
        pendingCustomOrder.some((id, i) => id !== customOrder[i])));

  const hasPendingChanges =
    mobileSheet &&
    (pendingSort !== sortOption ||
      pendingGrouping !== groupSpecialAtEnd ||
      pendingShowSections !== showSections ||
      customOrderChanged);

  const handleApply = () => {
    setSortOption(pendingSort);
    setGroupSpecialAtEnd(pendingGrouping);
    setCustomOrder(pendingCustomOrder);
    setShowSections(pendingShowSections);
    onClose();
  };

  return (
    <div className="relative flex flex-col h-full bg-background w-full">
      {/* Header */}
      {!mobileSheet && (
        <div className="shrink-0 border-b">
          <div className="flex items-center justify-between px-3 py-2 h-11">
            <span className="text-sm font-semibold text-foreground">{t('viewSettings.title')}</span>
            <button type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
              aria-label={t('viewSettings.close')}
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
            {t('viewSettings.sortHeading')}
          </h3>
          <div className="space-y-1">
            {SORT_VALUES.map((value) => {
              const selected = effSort === value;
              const showResetInline =
                value === 'custom' && hasCustomEffective;

              // The custom row carries a nested Reset button, which can't
              // legally live inside another <button>. Render that row as a
              // keyboard-accessible div instead. All other rows remain
              // plain buttons for simplicity.
              const handleSelect = () => handleSelectSort(value);
              const commonClass = `w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer ${
                selected ? 'bg-primary/10' : 'hover:bg-muted'
              }`;

              const inner = (
                <>
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
                      {t(SORT_KEYS[value].label)}
                    </span>
                    {value === 'custom' && hasCustomEffective && (
                      <span className="ml-auto flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                        <span>{t('viewSettings.customCount', { count: effCustomOrder!.length })}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetCustom();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.6875rem] text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          aria-label={t('viewSettings.resetCustom')}
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t('viewSettings.reset')}
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
                    {t(SORT_KEYS[value].desc)}
                  </p>
                </>
              );

              const rowEl = showResetInline ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleSelect}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect();
                    }
                  }}
                  className={commonClass}
                >
                  {inner}
                </div>
              ) : (
                <button type="button" onClick={handleSelect} className={commonClass}>
                  {inner}
                </button>
              );

              // Outlines are disclosed under (and scoped to) Build Order — the
              // sort that mirrors your build-page sections.
              const showOutlinesToggle = value === 'build-order' && selected;

              return (
                <div key={value}>
                  {rowEl}
                  {showOutlinesToggle && (
                    <button
                      type="button"
                      onClick={handleToggleSections}
                      className={`w-[calc(100%-1.5rem)] ml-6 mt-1 text-left rounded-md px-3 py-2 transition-colors cursor-pointer ${effShowSections ? 'bg-primary/10' : 'hover:bg-muted'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            effShowSections ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {effShowSections && <Check className="w-3 h-3 text-primary-foreground" />}
                        </span>
                        <span className={`text-sm ${effShowSections ? 'text-primary font-medium' : 'text-foreground'}`}>{t('viewSettings.showOutlines')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
                        Outlines groups of Pokémon matching your build-page sections.
                      </p>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grouping */}
        <div className="px-3 pt-3 pb-2 border-t">
          <h3 className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('viewSettings.groupingHeading')}
          </h3>
          <button type="button"
            onClick={handleToggleGrouping}
            className={`w-full text-left rounded-md px-3 py-2 transition-colors cursor-pointer ${effGrouping ? 'bg-primary/10' : 'hover:bg-muted'}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  effGrouping ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}
              >
                {effGrouping && <Check className="w-3 h-3 text-primary-foreground" />}
              </span>
              <span className={`text-sm ${effGrouping ? 'text-primary font-medium' : 'text-foreground'}`}>{t('viewSettings.groupSpecial')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
              Sends fossils, extra starters, paradox, pseudo-legendaries, ultra beasts,
              legendaries, and mythicals to the back of the grid. Does not affect Custom ordering.
            </p>
          </button>
        </div>

        <PageFooter />
        {/* Extra bottom padding so the floating button doesn't occlude the last row */}
        {hasPendingChanges && <div className="h-16" aria-hidden />}
      </div>

      {/* Floating "Update & View" button — mobile-sheet only */}
      {hasPendingChanges && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40">
          <button type="button"
            onClick={handleApply}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-colors"
          >
            {t('viewSettings.apply')}
          </button>
        </div>
      )}
    </div>
  );
}
