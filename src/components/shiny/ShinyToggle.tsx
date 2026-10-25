import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** The Shiny switch. Gold while on. `showLabel` adds the word beside the sparkle. */
export function ShinyToggle({ on, onToggle, showLabel = false, testId }: {
  on: boolean;
  onToggle: () => void;
  showLabel?: boolean;
  testId: string;
}) {
  const t = useT();
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      aria-label={showLabel ? undefined : t('shiny.label')}
      title={t('shiny.label')}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-md border text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        showLabel ? 'gap-1.5 px-2.5' : 'w-7',
        on ? 'border-[#E0A800] bg-[#FFF6D6] text-[#8A5A00]' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      <Sparkles size={16} aria-hidden />
      {showLabel ? <span>{t('shiny.label')}</span> : null}
    </button>
  );
}
