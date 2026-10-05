import { useT } from '@/i18n';
import { savedTypeRepairs } from '../model/typeRepairs';
import type { GenAxisId, TypeAxisId } from '../model/cells';

export function FavoritesTypeRepairNotice({ fills, onReview }: {
  fills: Readonly<Record<string, number>>;
  onReview: (type: TypeAxisId, gen: GenAxisId) => void;
}) {
  const t = useT();
  const repairs = savedTypeRepairs(fills);
  if (!repairs.length) return null;
  return <div role="status" data-testid="favorites-type-repair" className="flex shrink-0 items-start gap-3 border-b bg-muted px-3 py-2">
    <p className="min-w-0 flex-1 text-xs leading-relaxed">{t('favorites.typeRepair.message', { count: repairs.length })}</p>
    <button type="button" onClick={() => onReview(repairs[0].type, repairs[0].gen)}
      className="shrink-0 cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
      {t('favorites.typeRepair.review')}
    </button>
  </div>;
}
