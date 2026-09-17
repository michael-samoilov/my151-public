import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { generateExportImage, shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen, shouldShowExportSurvey } from '@/lib/exportSurvey';
import { isOptedOut } from '@/lib/clientId';
import { PREVIEW_DEPLOY } from '@/lib/demoMode';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useViewSort } from '@/hooks/useViewSort';
import { DEFAULT_STATS_HEIGHTS, STATS_MIN_POKEMON } from '@/components/view/DetailedStatsPanel';
import { useDetailedStatsData } from '@/components/view/useDetailedStatsData';
import type { ExportHighlight } from '@/league/export/exportPersonalization';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { LeagueExportSurvey } from '@/league/components/LeagueExportSurvey';
import { LeagueExportSurveyIntro } from '@/league/components/LeagueExportSurveyIntro';
import { DexExportSettingsPane } from './DexExportSettingsPane';

const SCRIM_Z = 200;
const PREVIEW_Z = 201;
const PANE_Z = 210;
const SETTINGS_SHEET_FRACTION = 0.45;

type DexExportPhase = 'settings' | 'surveyIntro' | 'survey';

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

export function DexExportOverlay({ onClose }: { onClose: () => void }) {
  const sections = usePokedexStore((s) => s.sections);
  const sortOption = usePokedexStore((s) => s.viewSortOption);
  const groupSpecialAtEnd = usePokedexStore((s) => s.viewGroupSpecialAtEnd);
  const customOrder = usePokedexStore((s) => s.viewCustomOrder);
  const showSections = usePokedexStore((s) => s.viewShowSections);
  const showStats = usePokedexStore((s) => s.viewShowStats);
  const sorted = useViewSort(sections, sortOption, groupSpecialAtEnd, customOrder);
  const statsData = useDetailedStatsData();
  const statsDataRef = useRef(statsData);
  statsDataRef.current = statsData;
  const showSectionOverlays = showSections && sortOption === 'build-order';
  const showStatsPanel = showStats && sorted.length >= STATS_MIN_POKEMON;

  const isDesktop = useViewportAtLeast(1024);
  const [phase, setPhase] = useState<DexExportPhase>('settings');
  const sheetCap = useSettingsSheetCap(!isDesktop && phase === 'settings');
  const chrome = useExportChrome(isDesktop);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const renderGenRef = useRef(0);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const renderPreview = useCallback(async () => {
    if (sorted.length === 0) {
      revokePreview();
      return;
    }
    const gen = ++renderGenRef.current;
    setPreviewBusy(true);
    try {
      const blob = await generateExportImage(sorted, {
        sections: showSectionOverlays ? sections : null,
        stats: showStatsPanel ? { data: statsDataRef.current, heights: DEFAULT_STATS_HEIGHTS } : null,
      });
      if (gen !== renderGenRef.current) return;
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      if (gen !== renderGenRef.current) return;
      console.error('Export preview failed:', err);
      revokePreview();
    } finally {
      if (gen === renderGenRef.current) setPreviewBusy(false);
    }
  }, [revokePreview, sections, showSectionOverlays, showStatsPanel, sorted]);

  useEffect(() => {
    if (phase !== 'settings') return;
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void renderPreview();
    }, 280);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [phase, renderPreview]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const runExport = useCallback(async () => {
    if (exportBusy || sorted.length === 0) return;
    setExportBusy(true);
    const ids = sorted.map((p) => p.id);
    try {
      const nextHighlight = await sendExportBeacon(
        ids,
        {
          sort: sortOption,
          outlines: showSectionOverlays,
          groupSpecial: groupSpecialAtEnd,
          showStats: showStatsPanel,
        },
        sections,
      );
      setHighlight(nextHighlight);
      const blob = previewUrlRef.current
        ? await fetch(previewUrlRef.current).then((r) => r.blob())
        : await generateExportImage(sorted, {
            sections: showSectionOverlays ? sections : null,
            stats: showStatsPanel ? { data: statsDataRef.current, heights: DEFAULT_STATS_HEIGHTS } : null,
          });
      await shareOrDownload(blob, 'my151.png');
      if (
        !shouldShowExportSurvey({
          optedOut: isOptedOut(),
          preview: PREVIEW_DEPLOY,
          seen: hasSeenExportSurvey(),
          ordinal: nextHighlight?.ordinal,
        })
      ) {
        onClose();
        return;
      }
      markExportSurveySeen();
      setSurveyOpenedAt(Date.now());
      setPhase('surveyIntro');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('Export failed:', err);
    } finally {
      setExportBusy(false);
    }
  }, [
    exportBusy,
    groupSpecialAtEnd,
    onClose,
    sections,
    showSectionOverlays,
    showStatsPanel,
    sortOption,
    sorted,
  ]);

  const paneTitle =
    phase === 'settings' ? 'Export' : phase === 'surveyIntro' ? 'Your export' : 'Quick question';

  const paneBody =
    phase === 'settings' ? (
      <DexExportSettingsPane
        busy={exportBusy || previewBusy}
        onExport={() => void runExport()}
        onClose={onClose}
        mobileSheet={!isDesktop}
      />
    ) : phase === 'surveyIntro' ? (
      <LeagueExportSurveyIntro
        tool="pokedex"
        highlight={highlight}
        onContinue={() => setPhase('survey')}
        onSkip={onClose}
      />
    ) : (
      <LeagueExportSurvey exportKind="pokedex" openedAt={surveyOpenedAt} onDone={onClose} />
    );

  const settingsPane = isDesktop ? (
    createPortal(
      <aside
        role="dialog"
        aria-label={paneTitle}
        className="fixed inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.5rem))] max-h-full flex-col border-l bg-card shadow-xl"
        style={{ zIndex: PANE_Z }}
        data-export-overlay
        data-export-chrome
        data-dex-export-overlay
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
      </aside>,
      document.body,
    )
  ) : (
    <BottomSheet
      onClose={onClose}
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
      <ExportScrim onClose={onClose} />
      <ExportPreviewLayer
        show={phase === 'settings'}
        dimmed={phase !== 'settings'}
        isDesktop={isDesktop}
        chromeW={chrome.w}
        chromeH={chrome.h}
      >
        <ExportPreview3D src={previewUrl} alt="Pokedex export preview" busy={previewBusy} />
      </ExportPreviewLayer>
      {settingsPane}
    </>
  );
}
