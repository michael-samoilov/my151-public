import { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useT } from '@/i18n';

/**
 * Picker settings. It follows the View page settings: a pane docked on the
 * right on desktop, a bottom sheet on mobile, and checkbox rows that apply as
 * they change.
 */
export function SettingsPane({
  desktop,
  noRepeats,
  onToggleNoRepeats,
  onClose,
}: {
  desktop: boolean;
  noRepeats: boolean;
  onToggleNoRepeats: () => void;
  onClose: () => void;
}) {
  const t = useT();

  useEffect(() => {
    if (!desktop) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [desktop, onClose]);

  const body = (
    <div className="px-3 pb-3 pt-3" data-testid="favorites-settings">
      <button
        type="button"
        data-testid="favorites-setting-no-repeats"
        aria-pressed={noRepeats}
        onClick={onToggleNoRepeats}
        className={`w-full cursor-pointer rounded-md px-3 py-2 text-left transition-colors ${noRepeats ? 'bg-primary/10' : 'hover:bg-muted'}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              noRepeats ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            }`}
          >
            {noRepeats && <Check className="h-3 w-3 text-primary-foreground" />}
          </span>
          <span className={`text-sm ${noRepeats ? 'font-medium text-primary' : 'text-foreground'}`}>
            {t('favorites.settings.noRepeats')}
          </span>
        </div>
        <p className="ml-6 mt-1 text-xs leading-snug text-muted-foreground">
          {t('favorites.settings.noRepeats.hint')}
        </p>
      </button>
    </div>
  );

  if (!desktop) {
    return (
      <BottomSheet onClose={onClose} closeLabel={t('favorites.settings.close')} title={t('favorites.settings.title')}>
        {body}
      </BottomSheet>
    );
  }

  return (
    <aside className="flex h-full w-[min(50%,380px)] shrink-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold text-foreground">{t('favorites.settings.title')}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t('favorites.settings.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </aside>
  );
}
