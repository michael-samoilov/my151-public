import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Hammer, Lock } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { isAnalyticsUnlocked, ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { useT } from '@/i18n';
import { LanguagePicker } from '@/components/layout/LanguagePicker';
import { ToolsMenu } from '@/components/layout/ToolsMenu';

export type AppView = 'builder' | 'view' | 'analytics';

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
 * The active tab's label, expanded.
 *
 * Gated at 380px rather than shown unconditionally: below that, the second
 * row's three cells (count, tabs, page controls) need every collapsed pixel
 * to keep the centred nav clear of its neighbours. The filled `default`
 * variant already marks the active tab, so collapsing to icons there loses
 * redundancy rather than information. Above `sm` every label shows.
 */
const LABEL_ACTIVE = 'min-[380px]:max-w-[7rem] min-[380px]:opacity-100 min-[380px]:ml-1';
const LABEL_WIDE = 'sm:max-w-[7rem] sm:opacity-100 sm:ml-1';

/**
 * The app's two-bar chrome. The top bar is the site's: wordmark left, the
 * language picker and the tools menu right — identical across tools. The
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

  return (
    <header className="bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2 sm:px-6">
        {/* The visible wordmark is the page's only <h1>, so on its own it gives
         * crawlers that DO execute JS (Google) a keyword-free heading — see
         * SEO-HANDOFF.md §0. The appended text completes the heading without
         * changing a pixel, and it is a genuine accessibility win too: screen
         * readers currently announce just "my151.app", which says nothing about
         * what the page is. */}
        <h1 className="whitespace-nowrap text-2xl font-extrabold tracking-tight">
          <span className="text-primary">my151</span><span className="text-foreground">.app</span>
          {/* Through the catalog like every other visible string. It is
              screen-reader-only, but "invisible" is not "untranslated": a
              Japanese visitor's screen reader should not read them an English
              tagline. The extraction spec catches it either way — that is how
              this was found. */}
          <span className="sr-only">{t('header.tagline')}</span>
        </h1>

        <div className="flex flex-shrink-0 items-center gap-1">
          {/* Always present, in every environment. The app negotiates a locale
              from `navigator.languages` at startup, so a visitor can be switched
              out of English without ever asking — and a switcher that only
              existed in preview builds would leave them no way back. Whatever
              picks the language, the control to change it has to be reachable. */}
          <LanguagePicker />
          <ToolsMenu current="dex" />
        </div>
      </div>

      {/* The tool bar. Three cells; the sides are minmax(0,1fr) so the centred
          nav can never be pushed into either neighbour. */}
      <div
        className="grid h-11 items-center gap-2 border-b px-3 sm:px-6"
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}
      >
        <div data-testid="tool-title" className="min-w-0">
          {count > 0 ? (
            <span className="whitespace-nowrap text-lg font-extrabold leading-none tracking-tight tabular-nums sm:text-2xl">
              <span className="text-primary">{count}</span>
              <span className="text-foreground">/151</span>
            </span>
          ) : (
            // The tool's name, as real text: the default a crawler executing
            // JS reads on a fresh visit. The count replaces it, not joins it.
            <h2 className="truncate text-lg font-extrabold leading-none tracking-tight">Dex Builder</h2>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={currentView === 'builder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('builder')}
            className="px-2 sm:px-3"
            data-nav="builder"
          >
            <Hammer className="h-4 w-4" />
            <span className={`${LABEL_ANIM} ${currentView === 'builder' ? LABEL_ACTIVE : ''} ${LABEL_WIDE}`}>{t('nav.build')}</span>
          </Button>

          {analyticsUnlocked ? (
            <Button
              variant={currentView === 'analytics' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('analytics')}
              className="px-2 sm:px-3"
              data-nav="analytics"
            >
              <BarChart3 className="h-4 w-4" />
              <span className={`${LABEL_ANIM} ${currentView === 'analytics' ? LABEL_ACTIVE : ''} ${LABEL_WIDE}`}>{t('nav.analytics')}</span>
            </Button>
          ) : (
            /* Locked until 25 Pokémon (sticky). Tapping explains rather than navigating. */
            <Tooltip open={lockTip} onOpenChange={setLockTip}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLockTip((o) => !o)}
                  className="px-2 text-muted-foreground/70 hover:text-muted-foreground sm:px-3"
                  data-nav="analytics"
                  aria-label={t('nav.analyticsLocked', { count: ANALYTICS_UNLOCK_AT })}
                >
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:ml-1 sm:inline">{t('nav.analytics')}</span>
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
            variant={currentView === 'view' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('view')}
            className="px-2 sm:px-3"
            data-nav="view"
          >
            <Camera className="h-4 w-4" />
            <span className={`${LABEL_ANIM} ${currentView === 'view' ? LABEL_ACTIVE : ''} ${LABEL_WIDE}`}>{t('nav.view')}</span>
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
