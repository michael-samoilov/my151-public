import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2, X } from 'lucide-react';
import { ExportPreviewShell } from '@/components/export/ExportPreviewShell';
import { useExportPreviewCache } from '@/components/export/useExportPreviewCache';
import { shareOrDownload, isShareAbort } from '@/lib/shareOrDownload';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocale, useT } from '@/i18n';
import { renderFullChart } from '../export/renderFullChart';
import { buildFavoritesSnapshot } from '../export/snapshot';

export default function FavoritesExportOverlay({ fills, onClose }: {
  fills: Readonly<Record<string, number>>;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const desktop = useIsDesktop();
  const snapshot = useMemo(() => buildFavoritesSnapshot(fills), [fills]);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = `${locale}-${attempt}-${snapshot.cells.map(cell => cell.mon?.id ?? '').join(',')}`;
  const settingsRef = useRef<HTMLDivElement>(null);
  const jobs = useMemo(() => [{ key, render: async () => {
    try {
      return await renderFullChart(snapshot);
    } catch (err) {
      setError(true);
      throw err;
    }
  } }], [key, snapshot]);
  const frames = useExportPreviewCache({ enabled: true, activeKey: key, jobs });

  useLayoutEffect(() => {
    const previous = document.querySelector<HTMLElement>('[data-testid="favorites-export-open"]');
    const dialog = settingsRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.setAttribute('aria-modal', 'true');
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')]
      .filter(control => control.getClientRects().length > 0);
    controls()[0]?.focus();
    const containKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Tab') {
        const targets = controls();
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', containKeys, true);
    return () => {
      document.removeEventListener('keydown', containKeys, true);
      requestAnimationFrame(() => previous?.focus());
    };
  }, [onClose]);

  async function save() {
    const url = frames.urls[key];
    if (!url || saving) return;
    setSaving(true);
    try {
      const blob = await (await fetch(url)).blob();
      try { await shareOrDownload(blob, 'my151-favorites.png'); }
      catch (err) { if (isShareAbort(err)) return; throw err; }
      onClose();
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  const settings = (
    <div ref={settingsRef} className="flex min-h-0 w-full flex-1 flex-col bg-background" data-testid="favorites-export-settings">
      {desktop && <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">{t('favorites.export.title')}</span>
        <button type="button" aria-label={t('favorites.export.close')} onClick={onClose}
          className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>}
      <div className="space-y-2 px-3 py-3">
        <h2 className="text-sm font-semibold">{t('favorites.export.fullChart')}</h2>
        <p className="text-sm text-muted-foreground">{t('favorites.export.description')}</p>
        <p className="text-xs text-muted-foreground">{t('favorites.completion.label', snapshot.completion)}</p>
        {error && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('favorites.export.error')}</p>
          <Button variant="outline" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{t('favorites.export.retry')}</Button>
        </div>}
      </div>
      <div className="mt-auto shrink-0 border-t px-3 py-3">
        <Button className="w-full cursor-pointer" data-testid="favorites-export-save" disabled={frames.busy || saving || error} onClick={() => void save()}>
          {frames.busy || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t('favorites.export.save')}
        </Button>
      </div>
    </div>
  );

  return <ExportPreviewShell phase="settings" onClose={onClose} settings={settings}
    surveyIntro={() => null} survey={() => null} previewAlt={t('favorites.export.preview')}
    frames={{ ...frames, activeKey: key }} bare overlayMarker="data-favorites-export-overlay"
    settingsTitle={t('favorites.export.title')} closeLabel={t('favorites.export.close')} />;
}
