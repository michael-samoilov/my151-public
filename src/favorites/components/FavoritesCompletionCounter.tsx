import { useMemo } from 'react';
import { buildFavoritesSnapshot } from '../export/snapshot';

export function FavoritesCompletionCounter({ fills, label }: {
  fills: Readonly<Record<string, number>>;
  label: (filled: number, total: number) => string;
}) {
  const { filled, total } = useMemo(() => buildFavoritesSnapshot(fills).completion, [fills]);
  return (
    <span
      data-testid="favorites-completion"
      aria-label={label(filled, total)}
      className="shrink-0 whitespace-nowrap text-[0.875rem] font-bold leading-tight tabular-nums"
    >
      <span className="font-extrabold text-primary">{filled}</span>
      <span className="text-foreground">/{total}</span>
    </span>
  );
}
