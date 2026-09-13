import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { shareOrDownload } from '@/lib/exportImage';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import {
  CARD_FILENAME,
  HOME_FILENAME,
  exportGymCard,
  exportLeagueHome,
} from '../export/exportLeague';
import { type LeagueHomeExportLayout, parseLeagueHomeExportLayout } from '../export/exportOptions';
import { incrementLeagueExportCount } from '../export/exportPersonalization';
import { sendLeagueExportBeacon } from '../hooks/useLeagueBeacon';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { ExportPreview3D } from './ExportPreview3D';
import { LeagueExportSurvey } from './LeagueExportSurvey';

function SettingsPanel({
  isLeague,
  layout,
  onLayout,
  busy,
  onExport,
  onClose,
}: {
  isLeague: boolean;
  layout: LeagueHomeExportLayout;
  onLayout: (next: LeagueHomeExportLayout) => void;
  busy: boolean;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
      {isLeague && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Layout</p>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={layout.gymDetails}
                onChange={(e) => onLayout({ ...layout, gymDetails: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Gym details column</span>
                <span className="block text-xs text-muted-foreground">
                  Theme, TM, and badge beside each row
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                checked={layout.sideBySide}
                onChange={(e) => onLayout({ ...layout, sideBySide: e.target.checked })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Story and rematch side by side</span>
                <span className="block text-xs text-muted-foreground">
                  Gym leaders only; uses the story/rematch teams from your league
                </span>
              </span>
            </label>
          </div>
        </div>
      )}

      {!isLeague && (
        <p className="text-sm text-muted-foreground">
          Trainer card exports match the card on screen. League summary exports can add optional columns.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button type="button" disabled={busy} onClick={onExport} data-league-export-confirm>
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" />
              Save image
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function LeagueExportOverlay() {
  const exportCardIndex = useLeagueUi((s) => s.exportCardIndex);
  const exportPhase = useLeagueUi((s) => s.exportPhase);
  const closeLeagueExport = useLeagueUi((s) => s.closeLeagueExport);
  const setExportPhase = useLeagueUi((s) => s.setExportPhase);

  const isDesktop = useViewportAtLeast(1024);
  const isLeague = exportCardIndex === null;
  const exportKind = isLeague ? 'league' : 'card';

  const [layout, setLayout] = useState<LeagueHomeExportLayout>(() =>
    parseLeagueHomeExportLayout(window.location.search),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const renderPreview = useCallback(async () => {
    setPreviewBusy(true);
    try {
      const { name, cards, view } = useLeagueStore.getState();
      const blob = isLeague
        ? await exportLeagueHome(name, cards, view, layout)
        : await exportGymCard(cards[exportCardIndex!]);
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      console.error('Export preview failed:', err);
      revokePreview();
    } finally {
      setPreviewBusy(false);
    }
  }, [exportCardIndex, isLeague, layout, revokePreview]);

  useEffect(() => {
    if (exportPhase !== 'settings') return;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void renderPreview();
    }, 280);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [exportPhase, layout, renderPreview]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const runExport = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    sendEventBeacon(isLeague ? 'league-export-league' : 'league-export-card');
    sendLeagueExportBeacon(exportKind);
    try {
      const { name, cards, view } = useLeagueStore.getState();
      const blob = isLeague
        ? await exportLeagueHome(name, cards, view, layout)
        : await exportGymCard(cards[exportCardIndex!]);
      await shareOrDownload(blob, isLeague ? HOME_FILENAME : CARD_FILENAME);
      incrementLeagueExportCount();
      setExportPhase('survey');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('League export failed:', err);
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, exportCardIndex, exportKind, isLeague, layout, setExportPhase]);

  const title = exportPhase === 'settings' ? 'Export' : 'Quick question';
  const paneBody =
    exportPhase === 'settings' ? (
      <SettingsPanel
        isLeague={isLeague}
        layout={layout}
        onLayout={setLayout}
        busy={exportBusy || previewBusy}
        onExport={() => void runExport()}
        onClose={closeLeagueExport}
      />
    ) : (
      <LeagueExportSurvey exportKind={exportKind} onDone={closeLeagueExport} />
    );

  const preview = (
    <ExportPreview3D
      src={previewUrl}
      alt={isLeague ? 'League export preview' : 'Trainer card export preview'}
      busy={previewBusy}
      className="mx-auto"
    />
  );

  if (!isDesktop) {
    const topGap = Math.round(window.innerHeight * 0.38);
    return (
      <BottomSheet
        onClose={closeLeagueExport}
        title={title}
        closeLabel={title}
        size="full"
        topGap={topGap}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex max-h-[38vh] shrink-0 items-center justify-center overflow-hidden border-b border-border/60 bg-muted/30 px-3 py-3">
            {preview}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{paneBody}</div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex" data-overlay data-export-overlay>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close export"
        onClick={closeLeagueExport}
      />
      <div className="relative z-[1] flex min-w-0 flex-1 items-center justify-center p-6 md:p-10">
        {preview}
      </div>
      <aside
        role="dialog"
        aria-label={title}
        className={cn(
          'relative z-[1] flex w-[24rem] max-w-[calc(100vw-1.5rem)] flex-col border-l bg-card shadow-xl',
          'max-h-full',
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-semibold">{title}</span>
          <button
            type="button"
            onClick={closeLeagueExport}
            aria-label="Close export"
            className="-me-1 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
      </aside>
    </div>
  );
}
