import { useId } from 'react';
import { fillVar, HOVER_LAYER } from '@/components/ui/hoverLayer';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { badgePillRadius, PILL_CLASS, PILL_OFF, pillIcon, pillStyle } from './pill';
import { NoShinyGlyph, ShinyGlyph } from './ShinyMarks';
import { SHINY_ON } from './shinyMarks';

/**
 * The on pill's 1.5 px ring, drawn over its 1 px transparent border. A thicker border made the pill
 * narrower, because browsers round a border to whole pixels and leave padding as it is. The ring is
 * the inner half of a 3 px stroke on the border edge. A CSS mask or an inset box snaps to whole
 * pixels at fractional positions, and drew the ring 2 px wide on one side and 1 px on the other.
 */
function Ring({ stroke, badgePx }: { stroke: string; badgePx?: number }) {
  const clip = useId();
  // A percentage `ry` with no `rx` rounds both radii to half the height, as `rounded-full` does.
  const ry = badgePx != null ? badgePillRadius(badgePx) : '50%';
  return (
    <svg aria-hidden className="pointer-events-none absolute -top-px -left-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible">
      <clipPath id={clip}><rect width="100%" height="100%" ry={ry} /></clipPath>
      <rect width="100%" height="100%" ry={ry} fill="none" stroke={stroke} strokeWidth={3} clipPath={`url(#${clip})`} />
    </svg>
  );
}

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
      className={cn(PILL_CLASS, iconOnly && 'justify-center', on ? `${HOVER_LAYER} border-transparent text-secondary-foreground` : PILL_OFF)}
      style={{ ...pillStyle({ badgePx, iconOnly }), ...(on ? { background: SHINY_ON.pillFill, ...fillVar(SHINY_ON.pillFill) } : null) }}
    >
      {on ? <Ring stroke={SHINY_ON.color} badgePx={badgePx} /> : null}
      {on ? <ShinyGlyph {...icon} /> : <NoShinyGlyph {...icon} />}
      <span className={iconOnly ? 'sr-only' : undefined}>{t('shiny.label')}</span>
    </button>
  );
}
