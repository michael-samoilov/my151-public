import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { NoShinyGlyph } from './ShinyMarks';

export function ShinyToggle({ on, onToggle, compact, testId }: {
  on: boolean;
  onToggle: () => void;
  compact: boolean;
  testId: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md border text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        compact ? 'gap-1 px-1' : 'gap-1.5 px-2.5',
        on ? 'border-[#E0A800] bg-[#FFF6D6] text-[#8A5A00]' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {on ? <Sparkles size={16} aria-hidden /> : <NoShinyGlyph size={16} />}
      <span>{t('shiny.label')}</span>
    </button>
  );
}
