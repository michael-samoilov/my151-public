import { Button } from '@/components/ui/button';
import { BarChart3, Camera, Hammer } from 'lucide-react';

declare const __BUILD_TIMESTAMP__: string;
const BUILD_VERSION = __BUILD_TIMESTAMP__.replace(/[-:]/g, '').slice(2, 13);

export type AppView = 'builder' | 'view' | 'analytics';

interface HeaderProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export function Header({ currentView, onViewChange }: HeaderProps) {
  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-3 sm:px-6 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
            <span className="text-primary">Personal</span> 151
          </h1>
          <span className="text-[9px] text-muted-foreground/40 self-end mb-0.5">
            v{BUILD_VERSION}
          </span>
        </div>

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
