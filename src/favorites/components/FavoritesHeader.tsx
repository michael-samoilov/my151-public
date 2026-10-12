import { useState, type Ref } from 'react';
import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { AnalyticsLockedIcon } from '@/components/shared/AnalyticsLockedIcon';
import { Tooltip, TooltipArrow, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, Download, Table2 } from 'lucide-react';
import { useT } from '@/i18n';
import { ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { FavoritesCompletionCounter } from './FavoritesCompletionCounter';

export type FavoritesView = 'picker' | 'analytics';

export function FavoritesHeader({ fills, filled, analyticsUnlocked, currentView, onViewChange, exportOpen, onExport, exportRef }: {
  fills: Readonly<Record<string, number>>;
  /** Filled cells, the count that unlocks Analytics. */
  filled: number;
  analyticsUnlocked: boolean;
  currentView: FavoritesView;
  onViewChange: (view: FavoritesView) => void;
  exportOpen: boolean;
  onExport: () => void;
  /** The Export button, which the completion popup points at. */
  exportRef?: Ref<HTMLButtonElement>;
}) {
  const t = useT();
  const [lockTip, setLockTip] = useState(false);
  const tabs = [
    { view: 'picker', label: t('favorites.nav.grid'), Icon: Table2 },
    { view: 'analytics', label: t('favorites.nav.analytics'), Icon: BarChart3 },
  ] as const;
  return <div className="flex h-11 shrink-0 items-center gap-1 border-b bg-card px-3" data-testid="favorites-header">
    <div className="mr-auto flex min-w-0 flex-col justify-center gap-[0.0625rem]">
      <h1 className="m-0 whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground">
        {t('home.favorites.title')}
      </h1>
      <FavoritesCompletionCounter fills={fills} label={(filled, total) => t('favorites.completion.label', { filled, total })} />
    </div>
    <div role="tablist" aria-label={t('home.favorites.title')} className="inline-flex h-8 shrink-0 items-center rounded-lg bg-muted p-0.5">
      {tabs.map(({ view, label, Icon }, index) => {
        const active = currentView === view;
        if (view === 'analytics' && !analyticsUnlocked) {
          // Locked until 25 favorites (sticky), as in the Dex builder. Tapping
          // explains rather than switching tabs.
          return <Tooltip key={view} open={lockTip} onOpenChange={setLockTip}>
            <TooltipTrigger asChild>
              <button type="button" role="tab" id={`favorites-tab-${view}`}
                aria-label={t('nav.analyticsLocked', { count: ANALYTICS_UNLOCK_AT })} aria-selected={false}
                aria-disabled tabIndex={-1} data-state="inactive" data-locked
                onClick={() => setLockTip((open) => !open)}
                className="inline-flex h-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3">
                <AnalyticsLockedIcon className="h-4 w-4 shrink-0" />
                <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 sm:ml-1 sm:max-w-none sm:opacity-100">{label}</span>
              </button>
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="bottom" className="z-[200] border-0 text-center shadow-lg">
                <TooltipArrow />
                <div className="text-xs font-medium">{t('nav.analyticsUnlockTip', { count: ANALYTICS_UNLOCK_AT })}</div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{Math.min(filled, ANALYTICS_UNLOCK_AT)}/{ANALYTICS_UNLOCK_AT}</div>
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>;
        }
        return <button key={view} type="button" role="tab" id={`favorites-tab-${view}`}
          aria-label={label} aria-selected={active} aria-controls={`favorites-panel-${view}`}
          tabIndex={active ? 0 : -1} data-state={active ? 'active' : 'inactive'}
          onClick={() => onViewChange(view)}
          onKeyDown={(event) => {
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1
              : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : null;
            if (target === null) return;
            event.preventDefault();
            const next = tabs[target].view;
            if (next === 'analytics' && !analyticsUnlocked) return;
            onViewChange(next);
            document.getElementById(`favorites-tab-${next}`)?.focus();
          }}
          className={`inline-flex h-7 cursor-pointer items-center justify-center rounded-md px-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3 ${active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'}`}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className={`overflow-hidden whitespace-nowrap ${active ? 'max-w-0 opacity-0 min-[380px]:ml-1 min-[380px]:max-w-none min-[380px]:opacity-100' : 'max-w-0 opacity-0'} sm:ml-1 sm:max-w-none sm:opacity-100`}>{label}</span>
        </button>;
      })}
    </div>
    <HeaderActionButton ref={exportRef} type="button" data-testid="favorites-export-open" aria-label={t('favorites.export.title')}
      aria-expanded={exportOpen} onClick={onExport}
      className="text-primary hover:bg-primary hover:text-primary-foreground">
      <Download className="h-4 w-4" aria-hidden />
    </HeaderActionButton>
  </div>;
}
