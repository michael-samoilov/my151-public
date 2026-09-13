import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
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
import { LeagueExportSettingsPane } from './LeagueExportSettingsPane';
import { LeagueExportSurvey } from './LeagueExportSurvey';
import { LeagueExportSurveyIntro } from './LeagueExportSurveyIntro';

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
      setExportPhase('surveyIntro');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('League export failed:', err);
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, exportCardIndex, exportKind, isLeague, layout, setExportPhase]);

  const paneTitle =
    exportPhase === 'settings'
      ? 'Export'
      : exportPhase === 'surveyIntro'
        ? 'Your export'
        : 'Quick question';

  const paneBody =
    exportPhase === 'settings' ? (
      <LeagueExportSettingsPane
        isLeague={isLeague}
        layout={layout}
        onLayout={setLayout}
        busy={exportBusy || previewBusy}
        onExport={() => void runExport()}
        onClose={closeLeagueExport}
        mobileSheet={!isDesktop}
      />
    ) : exportPhase === 'surveyIntro' ? (
      <LeagueExportSurveyIntro
        exportKind={exportKind}
        onContinue={() => setExportPhase('survey')}
        onSkip={closeLeagueExport}
      />
    ) : (
      <LeagueExportSurvey exportKind={exportKind} onDone={closeLeagueExport} />
    );

  const preview = (
    <ExportPreview3D
      src={previewUrl}
      alt={isLeague ? 'League export preview' : 'Trainer card export preview'}
      busy={previewBusy}
      className="mx-auto max-h-[min(42vh,20rem)] md:max-h-[min(70vh,32rem)]"
    />
  );

  const backdrop = (
    <button
      type="button"
      className="absolute inset-0 bg-black/60 backdrop-blur-md"
      aria-label="Close export"
      onClick={closeLeagueExport}
    />
  );

  const previewLayer = (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-[1] flex items-center justify-center p-4 pb-28 md:p-10 md:pb-10',
        exportPhase !== 'settings' && 'opacity-40',
      )}
    >
      <div className="pointer-events-auto">{preview}</div>
    </div>
  );

  if (!isDesktop) {
    return (
      <div className="fixed inset-0 z-[205] md:hidden" data-overlay data-export-overlay>
        <div className="absolute inset-0 z-0">{backdrop}</div>
        {exportPhase === 'settings' && (
          <div className="absolute inset-0 z-[1]">{previewLayer}</div>
        )}
        <BottomSheet
          onClose={closeLeagueExport}
          title={paneTitle}
          closeLabel={paneTitle}
          size="content"
          topGap={56}
          layerZIndex={210}
        >
          {paneBody}
        </BottomSheet>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex" data-overlay data-export-overlay>
      {backdrop}
      {previewLayer}
      <aside
        role="dialog"
        aria-label={paneTitle}
        className={cn(
          'relative z-[2] ml-auto flex w-[min(24rem,calc(100vw-1.5rem))] max-h-full flex-col border-l bg-card shadow-xl',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
      </aside>
    </div>
  );
}
