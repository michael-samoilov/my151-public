import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

const SCRIM_Z = 200;
const PREVIEW_Z = 201;
const PANE_Z = 210;

/**
 * Frosted scrim over the live league UI. Portalled to `document.body` so
 * `backdrop-filter` samples the app behind the overlay, not an empty ancestor.
 */
function ExportScrim({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: SCRIM_Z }} data-export-scrim data-overlay>
      <div
        aria-hidden
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-md"
        style={{ WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)' }}
      />
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="Close export"
        onClick={onClose}
      />
    </div>,
    document.body,
  );
}

function ExportPreviewLayer({
  show,
  dimmed,
  isDesktop,
  children,
}: {
  show: boolean;
  dimmed: boolean;
  isDesktop: boolean;
  children: ReactNode;
}) {
  if (!show) return null;
  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed flex items-center justify-center',
        dimmed && 'opacity-40',
        isDesktop
          ? 'inset-0 p-4 pr-[min(26rem,calc(100vw-1rem))] md:p-8'
          : 'inset-x-0 top-12 bottom-[min(58vh,28rem)] px-2',
      )}
      style={{ zIndex: PREVIEW_Z }}
      data-export-preview-layer
    >
      <div className="pointer-events-auto flex h-full w-full max-h-full max-w-full items-center justify-center">
        {children}
      </div>
    </div>,
    document.body,
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
      className="max-h-full max-w-full"
    />
  );

  const showPreview = exportPhase === 'settings';

  const settingsPane = isDesktop ? (
    createPortal(
      <aside
        role="dialog"
        aria-label={paneTitle}
        className="fixed inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.5rem))] max-h-full flex-col border-l bg-card shadow-xl"
        style={{ zIndex: PANE_Z }}
        data-export-overlay
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
      </aside>,
      document.body,
    )
  ) : (
    <BottomSheet
      onClose={closeLeagueExport}
      title={paneTitle}
      closeLabel={paneTitle}
      size="content"
      topGap={56}
      layerZIndex={PANE_Z}
      showScrim={false}
    >
      {paneBody}
    </BottomSheet>
  );

  return (
    <>
      <ExportScrim onClose={closeLeagueExport} />
      <ExportPreviewLayer show={showPreview} dimmed={exportPhase !== 'settings'} isDesktop={isDesktop}>
        {preview}
      </ExportPreviewLayer>
      {settingsPane}
    </>
  );
}
