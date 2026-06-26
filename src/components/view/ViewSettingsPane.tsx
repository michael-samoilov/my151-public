import { useEffect, useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { PageFooter } from '@/components/shared/PageFooter';
import { PREVIEW_FEATURES } from '@/lib/demoMode';
import { STATS_MIN_POKEMON, type StatsVariant } from '@/components/view/DetailedStatsPanel';

interface SortOption {
  value: ViewSortOption;
  label: string;
  description: string;
}

/** Preview-only: how the View grid + detailed-stats charts are presented. */
const STATS_PRESENTATION_OPTIONS: { value: StatsVariant; label: string; description: string }[] = [
  { value: 'bare', label: 'On canvas', description: 'Grid and charts sit directly on the page (matches the export).' },
  { value: 'card-title-out', label: 'Cards', description: 'Grid and each chart on raised cards; chart titles sit above the cards.' },
  { value: 'card-title-in', label: 'Cards, titles inside', description: 'Like Cards, but each chart’s title sits on its own card.' },
];

const SORT_OPTIONS: SortOption[] = [
  {
    value: 'build-order',
    label: 'Build Order',
    description:
      'Mirrors your build page exactly - the order and sections you set up there.',
  },
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
    value: 'custom',
    label: 'Custom',
    description:
      'Your own drag-to-reorder arrangement. Pick this (or just drag a line in the grid) to start from the current order and rearrange freely.',
  },
];

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
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const setSortOption = usePokedexStore((s) => s.setViewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const setGroupSpecialAtEnd = usePokedexStore((s) => s.setViewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const setCustomOrder = usePokedexStore((s) => s.setViewCustomOrder);
  const showSections = usePokedexStore((s) => s.viewShowSections);
  const setShowSections = usePokedexStore((s) => s.setViewShowSections);
  const showStats = usePokedexStore((s) => s.viewShowStats);
  const setShowStats = usePokedexStore((s) => s.setViewShowStats);
  const statsVariant = usePokedexStore((s) => s.viewStatsVariant);
  const setStatsVariant = usePokedexStore((s) => s.setViewStatsVariant);
  const statsTypeBadges = usePokedexStore((s) => s.viewStatsTypeBadges);
  const setStatsTypeBadges = usePokedexStore((s) => s.setViewStatsTypeBadges);
  const statsHeights = usePokedexStore((s) => s.viewStatsHeights);
  const setStatsHeights = usePokedexStore((s) => s.setViewStatsHeights);
  const placedCount = Object.values(sections).flat().length;
  const statsEnabled = placedCount >= STATS_MIN_POKEMON;

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
            <span className="text-sm font-semibold text-foreground">View Settings</span>
            <button type="button"
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
              const selected = effSort === opt.value;
              const showResetInline =
                opt.value === 'custom' && hasCustomEffective;

              // The custom row carries a nested Reset button, which can't
              // legally live inside another <button>. Render that row as a
              // keyboard-accessible div instead. All other rows remain
              // plain buttons for simplicity.
              const handleSelect = () => handleSelectSort(opt.value);
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
                      {opt.label}
                    </span>
                    {opt.value === 'custom' && hasCustomEffective && (
                      <span className="ml-auto flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                        <span>{effCustomOrder!.length} pokemon</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetCustom();
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.6875rem] text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          aria-label="Reset custom order"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
                    {opt.description}
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
              const showOutlinesToggle = opt.value === 'build-order' && selected;

              return (
                <div key={opt.value}>
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
                        <span className={`text-sm ${effShowSections ? 'text-primary font-medium' : 'text-foreground'}`}>Show section outlines</span>
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
            Grouping
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
              <span className={`text-sm ${effGrouping ? 'text-primary font-medium' : 'text-foreground'}`}>Group special Pokémon at end</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
              Sends fossils, extra starters, paradox, pseudo-legendaries, ultra beasts,
              legendaries, and mythicals to the back of the grid. Does not affect Custom ordering.
            </p>
          </button>
        </div>

        {/* Detailed stats — preview-only experiment */}
        {PREVIEW_FEATURES && (
          <div className="px-3 pt-3 pb-2 border-t">
            <h3 className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Stats
            </h3>
            <button
              type="button"
              onClick={() => statsEnabled && setShowStats(!showStats)}
              disabled={!statsEnabled}
              className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                !statsEnabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
              } ${showStats && statsEnabled ? 'bg-primary/10' : 'hover:bg-muted'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    showStats && statsEnabled ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {showStats && statsEnabled && <Check className="w-3 h-3 text-primary-foreground" />}
                </span>
                <span className={`text-sm ${showStats && statsEnabled ? 'text-primary font-medium' : 'text-foreground'}`}>
                  Show detailed stats
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 ml-6 leading-snug">
                {statsEnabled
                  ? 'Adds type, region, and base-stat-total charts beside the grid.'
                  : `Add at least ${STATS_MIN_POKEMON} Pokémon to enable detailed stats (${placedCount}/${STATS_MIN_POKEMON}).`}
              </p>
            </button>

            {/* Presentation style — only relevant once the stats are showing. */}
            {showStats && statsEnabled && (
              <div className="mt-1 ml-6">
                <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Presentation
                </p>
                {STATS_PRESENTATION_OPTIONS.map((opt) => {
                  const active = statsVariant === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatsVariant(opt.value)}
                      className={`w-full text-left rounded-md px-3 py-1.5 transition-colors cursor-pointer ${
                        active ? 'bg-primary/10' : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            active ? 'border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        </span>
                        <span className={`text-sm ${active ? 'text-primary font-medium' : 'text-foreground'}`}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-[1.375rem] leading-snug">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}

                {/* Type chart: full type-name badges vs. the small type symbols. */}
                <button
                  type="button"
                  onClick={() => setStatsTypeBadges(!statsTypeBadges)}
                  className={`w-full text-left rounded-md px-3 py-1.5 mt-1 transition-colors cursor-pointer ${
                    statsTypeBadges ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                        statsTypeBadges ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                      }`}
                    >
                      {statsTypeBadges && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </span>
                    <span className={`text-sm ${statsTypeBadges ? 'text-primary font-medium' : 'text-foreground'}`}>
                      Type name labels
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[1.375rem] leading-snug">
                    Use the full type-name images (as in the type filter) instead of the type symbols.
                  </p>
                </button>

                {/* Debug: per-chart height proportions. The stack is scaled to a
                    fixed total height, so these only redistribute the split. */}
                <div className="mt-2 px-3">
                  <p className="text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Debug · chart height split
                  </p>
                  {([
                    ['type', 'Type'],
                    ['region', 'Region'],
                    ['bst', 'Base stat total'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-foreground w-24 flex-shrink-0">{label}</span>
                      <input
                        type="range"
                        min={0.3}
                        max={2}
                        step={0.05}
                        value={statsHeights[key]}
                        onChange={(e) =>
                          setStatsHeights({ ...statsHeights, [key]: parseFloat(e.target.value) })
                        }
                        className="flex-1 cursor-pointer accent-primary"
                      />
                      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                        {statsHeights[key].toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setStatsHeights({ type: 1, region: 1, bst: 1 })}
                    className="text-xs text-primary hover:underline mt-1 cursor-pointer"
                  >
                    Reset to equal
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
            Update & View
          </button>
        </div>
      )}
    </div>
  );
}
