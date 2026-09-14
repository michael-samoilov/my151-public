import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen } from '@/lib/exportSurvey';
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
import {
  exportPokemonIds,
  incrementLeagueExportCount,
  type ExportHighlight,
} from '../export/exportPersonalization';
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
/** Mobile settings sheet: at most this fraction of the visual viewport. */
const SETTINGS_SHEET_FRACTION = 0.45;

function useSettingsSheetCap(active: boolean): number | undefined {
  const [cap, setCap] = useState<number | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return Math.round((window.visualViewport?.height ?? window.innerHeight) * SETTINGS_SHEET_FRACTION);
  });
  useLayoutEffect(() => {
    if (!active) return;
    const sync = () => {
      const vv = window.visualViewport;
      if (vv && Math.abs(vv.scale - 1) > 0.05) return;
      setCap(Math.round((vv?.height ?? window.innerHeight) * SETTINGS_SHEET_FRACTION));
    };
    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);
  return active ? cap : undefined;
}

function ExportScrim({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: SCRIM_Z }} data-export-scrim data-overlay>
      <div
        aria-hidden
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
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

function useExportChrome(isDesktop: boolean) {
  const [chrome, setChrome] = useState({ w: 384, h: 320 });
  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;
    const observe = (): boolean => {
      const el = document.querySelector('[data-export-chrome]');
      if (!el) return false;
      const apply = () => {
        const r = el.getBoundingClientRect();
        setChrome({ w: r.width, h: r.height });
      };
      apply();
      ro = new ResizeObserver(apply);
      ro.observe(el);
      return true;
    };
    if (observe()) return () => ro?.disconnect();
    const mo = new MutationObserver(() => {
      if (observe()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, [isDesktop]);
  return chrome;
}

function ExportPreviewLayer({
  show,
  dimmed,
  isDesktop,
  chromeW,
  chromeH,
  children,
}: {
  show: boolean;
  dimmed: boolean;
  isDesktop: boolean;
  chromeW: number;
  chromeH: number;
  children: ReactNode;
}) {
  if (!show) return null;
  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed flex min-h-0 min-w-0 items-center justify-center overflow-hidden p-6 md:p-12',
        dimmed && 'opacity-40',
      )}
      style={{
        zIndex: PREVIEW_Z,
        top: 0,
        left: 0,
        right: isDesktop ? chromeW : 0,
        bottom: isDesktop ? 0 : chromeH,
      }}
      data-export-preview-layer
    >
      <div className="pointer-events-auto grid h-full w-full min-h-0 min-w-0 place-items-center">
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
  const sheetCap = useSettingsSheetCap(!isDesktop && exportPhase === 'settings');
  const isLeague = exportCardIndex === null;
  const exportKind = isLeague ? 'league' : 'card';
  const chrome = useExportChrome(isDesktop);

  const [layout, setLayout] = useState<LeagueHomeExportLayout>(() =>
    parseLeagueHomeExportLayout(window.location.search),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);

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
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
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
    try {
      const { name, cards, view } = useLeagueStore.getState();
      const ids = exportPokemonIds(isLeague ? cards : [cards[exportCardIndex!]]);
      const nextHighlight = await sendLeagueExportBeacon(exportKind, ids);
      setHighlight(nextHighlight);
      const blob = isLeague
        ? await exportLeagueHome(name, cards, view, layout)
        : await exportGymCard(cards[exportCardIndex!]);
      await shareOrDownload(blob, isLeague ? HOME_FILENAME : CARD_FILENAME);
      incrementLeagueExportCount();
      if (hasSeenExportSurvey()) {
        closeLeagueExport();
        return;
      }
      markExportSurveySeen();
      setSurveyOpenedAt(Date.now());
      setExportPhase('surveyIntro');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('League export failed:', err);
    } finally {
      setExportBusy(false);
    }
  }, [closeLeagueExport, exportBusy, exportCardIndex, exportKind, isLeague, layout, setExportPhase]);

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
        tool={exportKind}
        highlight={highlight}
        onContinue={() => setExportPhase('survey')}
        onSkip={closeLeagueExport}
      />
    ) : (
      <LeagueExportSurvey
        exportKind={exportKind}
        openedAt={surveyOpenedAt}
        onDone={closeLeagueExport}
      />
    );

  const preview = (
    <ExportPreview3D
      src={previewUrl}
      alt={isLeague ? 'League export preview' : 'Trainer card export preview'}
      busy={previewBusy}
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
        data-export-chrome
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
      exportChrome
      capHeightPx={sheetCap}
    >
      {paneBody}
    </BottomSheet>
  );

  return (
    <>
      <ExportScrim onClose={closeLeagueExport} />
      <ExportPreviewLayer
        show={showPreview}
        dimmed={exportPhase !== 'settings'}
        isDesktop={isDesktop}
        chromeW={chrome.w}
        chromeH={chrome.h}
      >
        {preview}
      </ExportPreviewLayer>
      {settingsPane}
    </>
  );
}
