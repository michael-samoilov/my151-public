import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Hammer } from 'lucide-react';
import { AnalyticsLockedIcon } from '@/components/shared/AnalyticsLockedIcon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { isAnalyticsUnlocked, ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu, type ToolsCallout } from '@/components/layout/ToolsMenu';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { isFavoritesNoticeWindow, isLeaguePromoSeen, markLeaguePromoSeen } from '@/lib/launchFlags';

export type AppView = 'builder' | 'view' | 'analytics';

const HOME_HREF = '/';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  toolbarRef: (el: HTMLElement | null) => void;
  ref?: React.Ref<HTMLElement>;
}

const LABEL_ANIM = 'overflow-hidden transition-[max-width,opacity] duration-150 ease-out max-w-0 opacity-0';

const LABEL_ACTIVE = 'min-[380px]:max-w-[7rem] min-[380px]:opacity-100 min-[380px]:ml-1';
const LABEL_WIDE = 'sm:max-w-[7rem] sm:opacity-100 sm:ml-1';

function tabLabelClass(selected: boolean) {
  return cn(LABEL_ANIM, selected && LABEL_ACTIVE, LABEL_WIDE);
}

function tabTriggerClass(selected: boolean) {
  return cn(
    'px-2 sm:px-3',
    selected
      ? 'bg-card text-foreground shadow-sm hover:bg-card hover:text-foreground'
      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
  );
}

export function Header({ currentView, onViewChange, toolbarRef, ref }: HeaderProps) {
  const sections = usePokedexStore((s) => s.sections);
  const milestoneMax = usePokedexStore((s) => s.milestoneMax);
  const count = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const analyticsUnlocked = isAnalyticsUnlocked(milestoneMax);
  const [lockTip, setLockTip] = useState(false);
  const t = useT();

  const [placedAtMount] = useState(count);
  const [promo, setPromo] = useState(() => !isFavoritesNoticeWindow() && placedAtMount > 0 && !isLeaguePromoSeen());
  useEffect(() => {
    if (!promo) return;
    markLeaguePromoSeen();
    sendEventBeacon('league-promo-shown', { once: true });
  }, [promo]);
  const promoCallout: ToolsCallout | null = promo
    ? {
        text: t('promo.league.tip'),
        dismissLabel: t('promo.league.dismiss'),
        testId: 'league-promo',
        onDismiss: (reason) => {
          sendEventBeacon(reason === 'menu' ? 'league-promo-cta' : 'league-promo-dismiss');
          setPromo(false);
        },
      }
    : null;

  return (
    <header ref={ref} className="bg-card">
      <div className="flex h-11 items-center justify-between border-b px-3 sm:px-6">
        <p className="m-0 text-2xl font-extrabold whitespace-nowrap">
          <a
            href={HOME_HREF}
            data-testid="wordmark"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span lang="en" className="tracking-tight">
              <span className="text-primary">my151</span><span className="text-foreground">.app</span>
            </span>
            <span className="sr-only">{t('header.tagline')}</span>
          </a>
        </p>

        <div className="flex flex-shrink-0 items-center gap-0 min-[360px]:gap-1">
          <LanguagePicker />
          <FeedbackButton />
          <ToolsMenu current="dex" callout={promoCallout} />
        </div>
      </div>

      <div
        className="grid h-11 items-center gap-2 border-b px-3 sm:px-6"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}
      >
        <div data-testid="tool-title" className="flex min-w-0 flex-col justify-center gap-[0.0625rem]">
          <h1 className="m-0 overflow-hidden whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground">
            <span className="inline-block leading-none max-[680px]:sr-only">{t('header.toolNameQualifier')}</span>{' '}
            {t('header.toolNameCore')}
          </h1>
          <span className="whitespace-nowrap text-[0.875rem] font-bold leading-tight tabular-nums">
            <span className="font-extrabold text-primary">{count}</span>
            <span className="text-foreground">/151</span>
          </span>
        </div>

        <div
          role="tablist"
          aria-label={t('header.toolNameCore')}
          data-testid="dex-nav"
          className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={currentView === 'builder'}
            variant="ghost"
            size="pill"
            onClick={() => onViewChange('builder')}
            className={tabTriggerClass(currentView === 'builder')}
            data-nav="builder"
            data-state={currentView === 'builder' ? 'active' : 'inactive'}
          >
            <Hammer className="h-4 w-4" />
            <span className={tabLabelClass(currentView === 'builder')}>{t('nav.build')}</span>
          </Button>

          {analyticsUnlocked ? (
            <Button
              type="button"
              role="tab"
              aria-selected={currentView === 'analytics'}
              variant="ghost"
              size="pill"
              onClick={() => onViewChange('analytics')}
              className={tabTriggerClass(currentView === 'analytics')}
              data-nav="analytics"
              data-state={currentView === 'analytics' ? 'active' : 'inactive'}
            >
              <BarChart3 className="h-4 w-4" />
              <span className={tabLabelClass(currentView === 'analytics')}>{t('nav.analytics')}</span>
            </Button>
          ) : (
            <Tooltip open={lockTip} onOpenChange={setLockTip}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  variant="ghost"
                  size="pill"
                  onClick={() => setLockTip((o) => !o)}
                  className="px-2 text-muted-foreground hover:bg-transparent sm:px-3"
                  data-nav="analytics"
                  data-state="inactive"
                  aria-label={t('nav.analyticsLocked', { count: ANALYTICS_UNLOCK_AT })}
                >
                  <AnalyticsLockedIcon className="h-4 w-4" />
                  <span className={tabLabelClass(false)}>{t('nav.analytics')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom" className="z-[200] border-0 text-center shadow-lg">
                  <TooltipArrow />
                  <div className="text-xs font-medium">{t('nav.analyticsUnlockTip', { count: ANALYTICS_UNLOCK_AT })}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{Math.min(count, ANALYTICS_UNLOCK_AT)}/{ANALYTICS_UNLOCK_AT}</div>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          )}

          <Button
            type="button"
            role="tab"
            aria-selected={currentView === 'view'}
            variant="ghost"
            size="pill"
            onClick={() => onViewChange('view')}
            className={tabTriggerClass(currentView === 'view')}
            data-nav="view"
            data-state={currentView === 'view' ? 'active' : 'inactive'}
          >
            <Camera className="h-4 w-4" />
            <span className={tabLabelClass(currentView === 'view')}>{t('nav.view')}</span>
          </Button>
        </div>

        <div
          ref={toolbarRef}
          data-testid="tool-actions"
          className="flex min-w-0 items-center justify-end gap-1"
        />
      </div>
    </header>
  );
}
