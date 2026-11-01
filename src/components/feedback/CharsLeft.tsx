import { useTn } from '@/i18n';
import { cn } from '@/lib/utils';

// Silent until the last tenth of the limit, so a short note never shows a count.
export function CharsLeft({ length, max, className }: { length: number; max: number; className?: string }) {
  const tn = useTn();
  const left = max - length;
  if (left > max / 10) return null;
  return (
    <p aria-live="polite" className={cn('text-xs tabular-nums', left === 0 ? 'text-destructive' : 'text-muted-foreground', className)}>
      {tn('feedback.charsLeft', left)}
    </p>
  );
}
