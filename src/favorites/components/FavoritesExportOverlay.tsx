import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Download, Grid3x3, LayoutGrid, X } from 'lucide-react';
import { PokeBallSpinner } from '@/components/shared/PokeBallSpinner';
import { ExportPreviewShell } from '@/components/export/ExportPreviewShell';
import { useExportPreviewCache } from '@/components/export/useExportPreviewCache';
import { shareOrDownload, isShareAbort } from '@/lib/shareOrDownload';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocale, useT } from '@/i18n';
import { renderFullChart } from '../export/renderFullChart';
import { renderSimplifiedChart } from '../export/renderSimplifiedChart';
import { sendFavoriteExportBeacon } from '../hooks/useFavoriteBeacon';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { FavoritesTypeRepairNotice } from './FavoritesTypeRepairNotice';
import type { GenAxisId, TypeAxisId } from '../model/cells';

type ExportMode = 'full' | 'simplified';
const MODES: ExportMode[] = ['full', 'simplified'];
const VARIANTS = ['full', 'full-stats', 'simplified', 'simplified-stats'] as const;

export default function FavoritesExportOverlay({ fills, shiny, onClose, onReview }: {
  fills: Readonly<Record<string, number>>;
  shiny: Readonly<Record<string, number>>;
  onClose: () => void;
  onReview: (type: TypeAxisId, gen: GenAxisId) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const desktop = useIsDesktop();
  const snapshot = useMemo(() => buildFavoritesSnapshot(fills, shiny), [fills, shiny]);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<ExportMode>('full');
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [errorKeys, setErrorKeys] = useState<Record<string, true>>({});
  const [saving, setSaving] = useState(false);
  const contentKey = `${locale}-${attempt}-${snapshot.cells.map(cell => `${cell.key}:${cell.mon?.id ?? ''}${cell.shiny ? '*' : ''}`).join(',')}`;
  const variant = showDetailedStats ? `${mode}-stats` as const : mode;
  const key = `${variant}-${contentKey}`;
  const error = !!errorKeys[key];
  const settingsRef = useRef<HTMLDivElement>(null);
  const jobs = useMemo(() => VARIANTS.map(exportVariant => {
    const jobKey = `${exportVariant}-${contentKey}`;
    return { key: jobKey, render: async () => {
      try {
        if (exportVariant === 'full-stats' || exportVariant === 'simplified-stats') {
          const { renderChartWithStats } = await import('../export/renderChartWithStats');
          return await renderChartWithStats(snapshot, exportVariant === 'full-stats' ? 'full' : 'simplified');
        }
        return await (exportVariant === 'full' ? renderFullChart(snapshot) : renderSimplifiedChart(snapshot));
      } catch (err) {
        setErrorKeys(previous => ({ ...previous, [jobKey]: true }));
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
      sendFavoriteExportBeacon(snapshot, mode, showDetailedStats);
      onClose();
    } catch { setErrorKeys(previous => ({ ...previous, [key]: true })); }
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
      <FavoritesTypeRepairNotice fills={fills} onReview={onReview} />
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
        <label
          className={`relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
            showDetailedStats ? 'bg-primary/10' : 'hover:bg-muted'
          } ${saving ? 'cursor-default opacity-50' : ''}`}>
          <input type="checkbox" data-testid="favorites-export-stats" checked={showDetailedStats}
            disabled={saving} onChange={event => setShowDetailedStats(event.target.checked)}
            className="peer absolute z-10 h-4 w-4 cursor-pointer opacity-0" />
          <span aria-hidden="true"
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${
              showDetailedStats ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            }`}>
            {showDetailedStats && <Check className="h-3 w-3 text-primary-foreground" />}
          </span>
          <span className={`text-sm leading-tight ${showDetailedStats ? 'font-medium text-primary' : 'text-foreground'}`}>
            {t('viewSettings.showStats')}
          </span>
        </label>
        {error && <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('favorites.export.error')}</p>
          <Button variant="outline" onClick={() => { setErrorKeys({}); setAttempt(value => value + 1); }}>{t('favorites.export.retry')}</Button>
        </div>}
      </div>
      <div className="mt-auto shrink-0 border-t px-3 py-3">
        <Button className="w-full cursor-pointer" data-testid="favorites-export-save" disabled={frames.busy || saving || error} onClick={() => void save()}>
          {frames.busy || saving ? <PokeBallSpinner tone="line" className="h-4 w-4" /> : <Download className="h-4 w-4" />}
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
