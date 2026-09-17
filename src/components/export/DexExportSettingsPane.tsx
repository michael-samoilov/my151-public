import { Check, Download, Loader2, Lock, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePokedexStore } from '@/store/usePokedexStore';
import type { ViewSortOption } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { STATS_MIN_POKEMON } from '@/components/view/DetailedStatsPanel';
import { useT, type MessageKey } from '@/i18n';

const SORT_VALUES = ['build-order', 'regional', 'national', 'type', 'custom'] as const satisfies readonly ViewSortOption[];

const SORT_KEYS = {
  'build-order': { label: 'sort.build-order', desc: 'sort.build-order.desc' },
  regional: { label: 'sort.regional', desc: 'sort.regional.desc' },
  national: { label: 'sort.national', desc: 'sort.national.desc' },
  type: { label: 'sort.type', desc: 'sort.type.desc' },
  custom: { label: 'sort.custom', desc: 'sort.custom.desc' },
} as const satisfies Record<(typeof SORT_VALUES)[number], { label: MessageKey; desc: MessageKey }>;

export function DexExportSettingsPane({
  busy,
  onExport,
  onClose,
  mobileSheet = false,
}: {
  busy: boolean;
  onExport: () => void;
  onClose: () => void;
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
  const showStats = usePokedexStore((s) => s.viewShowStats);
  const setShowStats = usePokedexStore((s) => s.setViewShowStats);
  const placedCount = Object.values(sections).flat().length;
  const statsEnabled = placedCount >= STATS_MIN_POKEMON;
  const currentSorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const hasCustom = customOrder !== null;

  const handleSelectSort = (value: ViewSortOption) => {
    const needsSeed = value === 'custom' && customOrder === null;
    if (needsSeed) setCustomOrder(currentSorted.map((p) => p.id));
    setSortOption(value);
  };

  const handleResetCustom = () => {
    setCustomOrder(null);
    if (sortOption === 'custom') setSortOption('build-order');
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {!mobileSheet && (
        <div className="shrink-0 border-b">
          <div className="flex h-11 items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">Export</span>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close export"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className={mobileSheet ? 'space-y-2 px-3 pb-2 pt-1' : 'space-y-4 px-3 pb-2 pt-3'}>
          <div>
            <h3 className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('viewSettings.sortHeading')}
            </h3>
            <div className="space-y-1">
              {SORT_VALUES.map((value) => {
                const selected = sortOption === value;
                const showReset = value === 'custom' && hasCustom;
                const handleSelect = () => handleSelectSort(value);
                const rowClass = `w-full cursor-pointer rounded-md text-left transition-colors ${
                  mobileSheet ? 'px-2 py-1.5' : 'px-3 py-2'
                } ${selected ? 'bg-primary/10' : 'hover:bg-muted'}`;
                const inner = (
                  <>
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected ? 'border-primary' : 'border-muted-foreground/40'
                        }`}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className={`text-sm leading-tight ${selected ? 'font-medium text-primary' : 'text-foreground'}`}>
                        {t(SORT_KEYS[value].label)}
                      </span>
                      {showReset && (
                        <span className="ml-auto flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                          <span>{t('viewSettings.customCount', { count: customOrder!.length })}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetCustom();
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[0.6875rem] text-destructive transition-colors hover:bg-destructive/10"
                            aria-label={t('viewSettings.resetCustom')}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {t('viewSettings.reset')}
                          </button>
                        </span>
                      )}
                    </div>
                    {!mobileSheet && (
                      <p className="mt-1 ml-6 text-xs leading-snug text-muted-foreground">
                        {t(SORT_KEYS[value].desc)}
                      </p>
                    )}
                  </>
                );

                const row = showReset ? (
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
                    className={rowClass}
                    data-export-sort={value}
                  >
                    {inner}
                  </div>
                ) : (
                  <button type="button" onClick={handleSelect} className={rowClass} data-export-sort={value}>
                    {inner}
                  </button>
                );

                return (
                  <div key={value}>
                    {row}
                    {value === 'build-order' && selected && (
                      <button
                        type="button"
                        onClick={() => setShowSections(!showSections)}
                        data-export-outlines
                        className={`mt-1 ml-6 w-[calc(100%-1.5rem)] cursor-pointer rounded-md text-left transition-colors ${
                          mobileSheet ? 'px-2 py-1.5' : 'px-3 py-2'
                        } ${showSections ? 'bg-primary/10' : 'hover:bg-muted'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              showSections ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                            }`}
                          >
                            {showSections && <Check className="h-3 w-3 text-primary-foreground" />}
                          </span>
                          <span className={`text-sm leading-tight ${showSections ? 'font-medium text-primary' : 'text-foreground'}`}>
                            {t('viewSettings.showOutlines')}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('viewSettings.groupingHeading')}
            </h3>
            <button
              type="button"
              onClick={() => setGroupSpecialAtEnd(!groupSpecialAtEnd)}
              data-export-group-special
              className={`w-full cursor-pointer rounded-md text-left transition-colors ${
                mobileSheet ? 'px-2 py-1.5' : 'px-3 py-2'
              } ${groupSpecialAtEnd ? 'bg-primary/10' : 'hover:bg-muted'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    groupSpecialAtEnd ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {groupSpecialAtEnd && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className={`text-sm leading-tight ${groupSpecialAtEnd ? 'font-medium text-primary' : 'text-foreground'}`}>
                  {t('viewSettings.groupSpecial')}
                </span>
              </div>
            </button>
          </div>

          <div>
            <h3 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('viewSettings.statsHeading')}
            </h3>
            <button
              type="button"
              onClick={() => {
                if (!statsEnabled) return;
                setShowStats(!showStats);
              }}
              disabled={!statsEnabled}
              data-export-stats
              className={`w-full rounded-md text-left transition-colors ${
                !statsEnabled ? 'cursor-default opacity-50' : 'cursor-pointer'
              } ${mobileSheet ? 'px-2 py-1.5' : 'px-3 py-2'} ${
                showStats && statsEnabled ? 'bg-primary/10' : 'hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2">
                {!statsEnabled ? (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                ) : (
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      showStats ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`}
                  >
                    {showStats && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                )}
                <span className={`text-sm leading-tight ${showStats && statsEnabled ? 'font-medium text-primary' : 'text-foreground'}`}>
                  {t('viewSettings.showStats')}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className={`flex shrink-0 flex-col gap-2 border-t pt-2 ${mobileSheet ? 'px-3 pb-3' : 'px-4 pb-4'}`}>
        <Button type="button" disabled={busy} onClick={onExport} data-dex-export-confirm>
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" />
              Save image
            </>
          )}
        </Button>
        {!mobileSheet && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
