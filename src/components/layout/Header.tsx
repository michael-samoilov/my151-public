import { Button } from '@/components/ui/button';
import { BarChart3, Camera, Hammer } from 'lucide-react';

export type AppView = 'builder' | 'view' | 'analytics';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-3 sm:px-6 py-2">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
          <span className="text-primary">Personal</span> 151
        </h1>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant={currentView === 'builder' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('builder')}
            className="px-2 sm:px-3"
          >
            <Hammer className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Build</span>
          </Button>
          <Button
            variant={currentView === 'analytics' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('analytics')}
            className="px-2 sm:px-3"
          >
            <BarChart3 className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Analytics</span>
          </Button>
          <Button
            variant={currentView === 'view' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('view')}
            className="px-2 sm:px-3"
          >
            <Camera className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">View</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
