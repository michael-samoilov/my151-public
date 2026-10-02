import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Grid3x3, LayoutGrid, Loader2, X } from 'lucide-react';
import { ExportPreviewShell } from '@/components/export/ExportPreviewShell';
import { useExportPreviewCache } from '@/components/export/useExportPreviewCache';
import { shareOrDownload, isShareAbort } from '@/lib/shareOrDownload';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocale, useT } from '@/i18n';
import { renderFullChart } from '../export/renderFullChart';
import { renderSimplifiedChart } from '../export/renderSimplifiedChart';
import { buildFavoritesSnapshot } from '../export/snapshot';

type ExportMode = 'full' | 'simplified';
const MODES: ExportMode[] = ['full', 'simplified'];

export default function FavoritesExportOverlay({ fills, onClose }: {
  fills: Readonly<Record<string, number>>;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const desktop = useIsDesktop();
  const snapshot = useMemo(() => buildFavoritesSnapshot(fills), [fills]);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<ExportMode>('full');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentKey = `${locale}-${attempt}-${snapshot.cells.map(cell => `${cell.key}:${cell.mon?.id ?? ''}`).join(',')}`;
  const key = `${mode}-${contentKey}`;
  const error = errorKey === key;
  const settingsRef = useRef<HTMLDivElement>(null);
  const jobs = useMemo(() => MODES.map(exportMode => {
    const jobKey = `${exportMode}-${contentKey}`;
    return { key: jobKey, render: async () => {
      try {
        return await (exportMode === 'full' ? renderFullChart(snapshot) : renderSimplifiedChart(snapshot));
      } catch (err) {
        setErrorKey(jobKey);
        throw err;
      }
    } };
  }), [contentKey, snapshot]);
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
    } catch { setErrorKey(key); }
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
        <div className="grid grid-cols-2 gap-1" aria-label={t('favorites.export.title')}>
          {MODES.map(option => {
            const Icon = option === 'full' ? Grid3x3 : LayoutGrid;
            return <button key={option} type="button" data-favorites-export-mode={option}
              aria-pressed={mode === option} disabled={saving} onClick={() => setMode(option)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[0.6875rem] leading-tight transition-colors ${
                mode === option ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
              }`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {t(option === 'full' ? 'favorites.export.fullGrid' : 'favorites.export.simplified')}
            </button>;
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('favorites.completion.label', snapshot.completion)}</p>
        {error && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('favorites.export.error')}</p>
          <Button variant="outline" onClick={() => { setErrorKey(null); setAttempt(value => value + 1); }}>{t('favorites.export.retry')}</Button>
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
