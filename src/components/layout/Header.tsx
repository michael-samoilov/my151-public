import { Button } from '@/components/ui/button';
import { BarChart3, Grid3X3, Hammer } from 'lucide-react';

export type AppView = 'builder' | 'view' | 'analytics';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-primary">Personal</span> 151
          </h1>
          <span className="text-xs text-muted-foreground hidden sm:block">
            Pokedex Region Builder
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={currentView === 'builder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('builder')}
          >
            <Hammer className="w-4 h-4 mr-1" />
            Build
          </Button>
          <Button
            variant={currentView === 'view' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('view')}
          >
            <Grid3X3 className="w-4 h-4 mr-1" />
            View
          </Button>
          <Button
            variant={currentView === 'analytics' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('analytics')}
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            Analytics
          </Button>
        </div>
      </div>
    </header>
  );
}
