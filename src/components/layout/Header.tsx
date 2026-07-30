import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Hammer, Lock } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { isAnalyticsUnlocked, ANALYTICS_UNLOCK_AT } from '@/lib/milestones';
import { useT } from '@/i18n';
import { LanguagePicker } from '@/components/layout/LanguagePicker';

export type AppView = 'builder' | 'view' | 'analytics';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

// The cap has to be a concrete length for the collapse animation to have
// something to transition to. 7rem rather than 5rem because the longest
// translated nav label plus normal expansion overflows 5rem — the e2e
// pseudo-locale run catches it at 360px.
const LABEL_ANIM = 'overflow-hidden transition-[max-width,opacity] duration-150 ease-out max-w-0 opacity-0';

/**
 * The active tab's label, expanded.
 *
 * Gated at 380px rather than shown unconditionally: the wordmark, the language
 * globe and three tabs need 366px with the longest label expanded (measured
 * against `en-XA`, which pads English by 40% — worse than any real locale), so
 * below that the row would push the page sideways. The filled `default` variant
 * already marks the active tab, so collapsing to icons there loses redundancy
 * rather than information. Above `sm` every label shows regardless.
 */
const LABEL_ACTIVE = 'min-[380px]:max-w-[7rem] min-[380px]:opacity-100 min-[380px]:ml-1';
const LABEL_WIDE = 'sm:max-w-[7rem] sm:opacity-100 sm:ml-1';

export function Header({ currentView, onViewChange }: HeaderProps) {
  const sections = usePokedexStore((s) => s.sections);
  const milestoneMax = usePokedexStore((s) => s.milestoneMax);
  const count = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const analyticsUnlocked = isAnalyticsUnlocked(milestoneMax);
  const [lockTip, setLockTip] = useState(false);
  const t = useT();

  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-3 sm:px-6 py-2">
        <h1 className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
          <span className="text-primary">my151</span><span className="text-foreground">.app</span>
        </h1>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Always present, in every environment. The app negotiates a locale
              from `navigator.languages` at startup, so a visitor can be switched
              out of English without ever asking — and a switcher that only
              existed in preview builds would leave them no way back. Whatever
              picks the language, the control to change it has to be reachable.

              It ships ahead of the translated UI on purpose. Today a non-English
              locale gets official terminology and Pokémon names with English
              chrome; someone who lands there and wants English needs this
              button, and someone who wants their own language should not have
              to wait for the rest of the corpus to find it. */}
          <LanguagePicker />
          <Button
            variant={currentView === 'builder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('builder')}
            className="px-2 sm:px-3"
            data-nav="builder"
          >
            <Hammer className="w-4 h-4" />
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
              <BarChart3 className="w-4 h-4" />
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
                  className="px-2 sm:px-3 text-muted-foreground/70 hover:text-muted-foreground"
                  data-nav="analytics"
                  aria-label={t('nav.analyticsLocked', { count: ANALYTICS_UNLOCK_AT })}
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline sm:ml-1">{t('nav.analytics')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom" className="z-[200] text-center border-0 shadow-lg">
                  <TooltipArrow />
                  <div className="text-xs font-medium">{t('nav.analyticsUnlockTip', { count: ANALYTICS_UNLOCK_AT })}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{Math.min(count, ANALYTICS_UNLOCK_AT)}/{ANALYTICS_UNLOCK_AT}</div>
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
            <Camera className="w-4 h-4" />
            <span className={`${LABEL_ANIM} ${currentView === 'view' ? LABEL_ACTIVE : ''} ${LABEL_WIDE}`}>{t('nav.view')}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
