import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Hammer, Lock } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { isAnalyticsUnlocked, ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu, type ToolsCallout } from '@/components/layout/ToolsMenu';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { isLeaguePromoSeen, markLeaguePromoSeen } from '@/lib/launchFlags';

export type AppView = 'builder' | 'view' | 'analytics';

/** Where the wordmark goes: the hub, which routes to every tool. */
const HOME_HREF = '/';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  /** Where the active page portals its controls (second row, right cell). */
  toolbarRef: (el: HTMLElement | null) => void;
}

// The cap has to be a concrete length for the collapse animation to have
// something to transition to. 7rem rather than 5rem because the longest
// translated nav label plus normal expansion overflows 5rem — the e2e
// pseudo-locale run catches it at 360px.
const LABEL_ANIM = 'overflow-hidden transition-[max-width,opacity] duration-150 ease-out max-w-0 opacity-0';

/**
 * Every tab shows its label at the same width, or none of them do.
 * Expanding only the active label made it read as the sole button.
 * Below `sm` the three cells (count, tabs, page controls) keep icons
 * only, so a 4-digit count still clears the centred tablist.
 */
const LABEL_WIDE = 'sm:max-w-[7rem] sm:opacity-100 sm:ml-1';

function tabTriggerClass(selected: boolean) {
  return cn(
    'px-2 sm:px-3',
    selected
      ? 'bg-card text-foreground shadow-sm hover:bg-card hover:text-foreground'
      : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
  );
}

/**
 * The app's two-bar chrome. The top bar is the site's: wordmark left, the
 * language picker, the report button and the tools menu right — identical
 * across tools, and the same height as the bar under it. The
 * second bar is the dex builder's: the tool name (the count once anything
 * is placed) left, the view nav centred, and the active page's controls
 * right. The milestone progress bar is gone — the admin dashboard showed
 * it did not lift conversion; the milestone popups stay (MilestoneCelebration
 * mounts in App, independent of this chrome).
 */
export function Header({ currentView, onViewChange, toolbarRef }: HeaderProps) {
  const sections = usePokedexStore((s) => s.sections);
  const milestoneMax = usePokedexStore((s) => s.milestoneMax);
  const count = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const analyticsUnlocked = isAnalyticsUnlocked(milestoneMax);
  const [lockTip, setLockTip] = useState(false);
  const t = useT();

  // Tells a person who already had a dex that the gym leader maker exists:
  // once per browser, on the first visit after the launch, and only when a
  // dex was already saved when the page opened — a new visitor has no
  // reason to be interrupted, and usually came from the hub, which is the
  // same message as a page. The hub marks it seen for anyone who came that
  // way. A tooltip on the Tools menu, so it points at where the tool is.
  const [placedAtMount] = useState(count);
  const [promo, setPromo] = useState(() => placedAtMount > 0 && !isLeaguePromoSeen());
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
    <header className="bg-card">
      <div className="flex h-11 items-center justify-between border-b px-3 sm:px-6">
        {/* The wordmark is not the page's heading: the h1 is the tool bar's
         * eyebrow below, so the heading Google reads names the tool. The sr-only
         * tagline stays for screen readers, which otherwise hear only
         * "my151.app". */}
        <p className="m-0 text-2xl font-extrabold tracking-tight whitespace-nowrap">
          {/* The wordmark is the way back to the router page, the way a logo is
              on any other site. It is a plain link, not a view switch: the
              router is a separate entry point, and the Pokédex lives in
              localStorage, so a full navigation loses nothing.
              No colour or underline reset needed — Tailwind's preflight already
              gives `a` `color: inherit` and `text-decoration: inherit`, so the
              spans below keep their own colours and nothing turns blue. */}
          <a
            href={HOME_HREF}
            data-testid="wordmark"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="text-primary">my151</span><span className="text-foreground">.app</span>
            {/* Through the catalog like every other visible string. It is
                screen-reader-only, but "invisible" is not "untranslated": a
                Japanese visitor's screen reader should not read them an English
                tagline. The extraction spec catches it either way — that is how
                this was found. */}
            <span className="sr-only">{t('header.tagline')}</span>
          </a>
        </p>

        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Always present, in every environment. The app negotiates a locale
              from `navigator.languages` at startup, so a visitor can be switched
              out of English without ever asking — and a switcher that only
              existed in preview builds would leave them no way back. Whatever
              picks the language, the control to change it has to be reachable. */}
          <LanguagePicker />
          <FeedbackButton />
          <ToolsMenu current="dex" callout={promoCallout} />
        </div>
      </div>

      {/* The tool bar. Three cells; the sides are minmax(0,1fr) so the centred
          nav can never be pushed into either neighbour. */}
      <div
        className="grid h-11 items-center gap-2 border-b px-3 sm:px-6"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}
      >
        {/* The tool's identity in two lines, the league builder's pattern: the
            page's h1 as a small eyebrow that never changes, and the count under
            it. The eyebrow is the one h1 on the page and matches the title tag,
            which is what Google falls back to when it rewrites a title. */}
        <div data-testid="tool-title" className="flex min-w-0 flex-col justify-center gap-[0.0625rem]">
          {/* One line, always. The centred nav leaves this cell about 105px on
              a phone and the full name is 130px (142px at 640px, where the
              cell is 138px), so below 680px the qualifier is
              screen-reader-only: the eye reads "Pokédex Builder", the DOM and
              a crawler read the whole phrase, and nothing is clipped or given
              an ellipsis. Inline-block with the heading's line height, so its
              box never stands taller than the heading that clips it. */}
          <h1 className="m-0 overflow-hidden whitespace-nowrap text-[0.6875rem] font-semibold leading-none text-muted-foreground">
            {/* The space is a node between the two, not the qualifier's trailing
                character: an inline-block box trims trailing whitespace at its
                edge, which butted "Custom" against "Pokédex". When the qualifier
                is sr-only (absolute) below 680px, this space is the line's
                leading whitespace and the browser collapses it, so the eye still
                reads "Pokédex Builder" with no gap. */}
            <span className="inline-block leading-none max-[680px]:sr-only">{t('header.toolNameQualifier')}</span>{' '}
            {t('header.toolNameCore')}
          </h1>
          <span className="whitespace-nowrap text-[0.875rem] font-bold leading-tight tabular-nums">
            {/* The count is the number that changes and the one a person
                looks for; the total is fixed context. A weight step separates
                them the way the colour already does. */}
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
            <span className={`${LABEL_ANIM} ${LABEL_WIDE}`}>{t('nav.build')}</span>
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
              <span className={`${LABEL_ANIM} ${LABEL_WIDE}`}>{t('nav.analytics')}</span>
            </Button>
          ) : (
            /* Locked until 25 Pokémon (sticky). Tapping explains rather than navigating. */
            <Tooltip open={lockTip} onOpenChange={setLockTip}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  variant="ghost"
                  size="pill"
                  onClick={() => setLockTip((o) => !o)}
                  className="px-2 text-muted-foreground/70 hover:bg-transparent hover:text-muted-foreground sm:px-3"
                  data-nav="analytics"
                  data-state="inactive"
                  aria-label={t('nav.analyticsLocked', { count: ANALYTICS_UNLOCK_AT })}
                >
                  <Lock className="h-4 w-4" />
                  <span className={`${LABEL_ANIM} ${LABEL_WIDE}`}>{t('nav.analytics')}</span>
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
            <span className={`${LABEL_ANIM} ${LABEL_WIDE}`}>{t('nav.view')}</span>
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
