import { useMemo } from 'react';
import { buildFavoritesSnapshot } from '../export/snapshot';

export function FavoritesCompletionCounter({ fills, label }: {
  fills: Readonly<Record<string, number>>;
  label: (filled: number, total: number) => string;
}) {
  const { filled, total } = useMemo(() => buildFavoritesSnapshot(fills).completion, [fills]);
  return (
    // platform: Some screen readers ignore `aria-label` on a plain span, so the spoken phrase is hidden text and the visible count is `aria-hidden`.
    <span className="shrink-0 whitespace-nowrap text-[0.875rem] font-bold leading-tight tabular-nums">
      <span data-testid="favorites-completion" aria-hidden="true">
        <span className="font-extrabold text-primary">{filled}</span>
        <span className="text-foreground">/{total}</span>
      </span>
      <span className="sr-only">{label(filled, total)}</span>
    </span>
  );
}
