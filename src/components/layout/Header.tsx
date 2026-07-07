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
            <span className={`overflow-hidden transition-[max-width,opacity] duration-150 ease-out ${currentView === 'builder' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>Build</span>
          </Button>
          <Button
            variant={currentView === 'analytics' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('analytics')}
            className="px-2 sm:px-3"
            data-nav="analytics"
          >
            <BarChart3 className="w-4 h-4" />
            <span className={`overflow-hidden transition-[max-width,opacity] duration-150 ease-out ${currentView === 'analytics' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>Analytics</span>
          </Button>
          <Button
            variant={currentView === 'view' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange('view')}
            className="px-2 sm:px-3"
            data-nav="view"
          >
            <Camera className="w-4 h-4" />
            <span className={`overflow-hidden transition-[max-width,opacity] duration-150 ease-out ${currentView === 'view' ? 'max-w-[5rem] opacity-100 ml-1' : 'max-w-0 opacity-0'} sm:max-w-[5rem] sm:opacity-100 sm:ml-1`}>View</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
