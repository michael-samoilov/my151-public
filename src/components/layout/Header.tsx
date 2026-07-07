import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { BarChart3, Camera, Hammer, Lock } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { isAnalyticsUnlocked, ANALYTICS_UNLOCK_AT } from '@/lib/milestones';

export type AppView = 'builder' | 'view' | 'analytics';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const LABEL_ANIM = 'overflow-hidden transition-[max-width,opacity] duration-150 ease-out';

export function Header({ currentView, onViewChange }: HeaderProps) {
  const sections = usePokedexStore((s) => s.sections);
  const milestoneMax = usePokedexStore((s) => s.milestoneMax);
  const count = Object.values(sections).reduce((s, a) => s + a.length, 0);
  const analyticsUnlocked = isAnalyticsUnlocked(milestoneMax);
  const [lockTip, setLockTip] = useState(false);

  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-3 sm:px-6 py-2">
        <h1 className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
          <span className="text-primary">my151</span><span className="text-foreground">.app</span>
        </h1>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant={currentView === 'builder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('builder')}
            className="px-2 sm:px-3"
            data-nav="builder"
          >
            <Hammer className="w-4 h-4" />
            <span className={`${LABEL_ANIM} ${currentView === 'builder' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>Build</span>
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
              <span className={`${LABEL_ANIM} ${currentView === 'analytics' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>Analytics</span>
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
                  aria-label={`Analytics locked. Reach ${ANALYTICS_UNLOCK_AT} Pokémon to unlock`}
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline sm:ml-1">Analytics</span>
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom" className="z-[200] text-center border-0 shadow-lg">
                  <TooltipArrow />
                  <div className="text-xs font-medium">Reach {ANALYTICS_UNLOCK_AT} Pokémon to unlock Analytics</div>
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
            <span className={`${LABEL_ANIM} ${currentView === 'view' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>View</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
