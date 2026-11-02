import { useTn } from '@/i18n';
import { cn } from '@/lib/utils';

export function CharsLeft({ length, max, className }: { length: number; max: number; className?: string }) {
  const tn = useTn();
  const left = max - length;
  if (left > max / 10) return null;
  return (
    <p aria-live="polite" className={cn('text-xs tabular-nums text-destructive', className)}>
      {tn('feedback.charsLeft', left)}
    </p>
  );
}
