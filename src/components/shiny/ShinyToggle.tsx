import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { PILL_CLASS, PILL_OFF, pillIcon, pillStyle } from './pill';
import { NoShinyGlyph, ShinyGlyph } from './ShinyMarks';
import { SHINY_ON } from './shinyMarks';

export function ShinyToggle({ on, onToggle, badgePx, iconOnly = false, testId }: {
  on: boolean;
  onToggle: () => void;
  badgePx?: number;
  /** Keeps the label for screen readers only. */
  iconOnly?: boolean;
  testId: string;
}) {
  const t = useT();
  const icon = pillIcon(badgePx);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(PILL_CLASS, iconOnly && 'justify-center', on ? 'text-secondary-foreground' : PILL_OFF)}
      style={{
        ...pillStyle({ badgePx, thick: on, iconOnly }),
        ...(on ? { border: `1.5px solid ${SHINY_ON.pillBorder}`, background: SHINY_ON.pillFill } : null),
      }}
    >
      {on ? <ShinyGlyph {...icon} /> : <NoShinyGlyph {...icon} />}
      <span className={iconOnly ? 'sr-only' : undefined}>{t('shiny.label')}</span>
    </button>
  );
}
