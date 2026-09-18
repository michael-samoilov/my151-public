import { useCallback, useMemo, useRef, useState } from 'react';
import { generateExportImage, shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen, shouldShowExportSurvey } from '@/lib/exportSurvey';
import { isOptedOut } from '@/lib/clientId';
import { PREVIEW_DEPLOY } from '@/lib/demoMode';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { usePokedexStore } from '@/store/usePokedexStore';
import { computeViewSort } from '@/hooks/useViewSort';
import { DEFAULT_STATS_HEIGHTS, STATS_MIN_POKEMON } from '@/components/view/DetailedStatsPanel';
import { useDetailedStatsData } from '@/components/view/useDetailedStatsData';
import type { ExportHighlight } from '@/league/export/exportPersonalization';
import { LeagueExportSurvey } from '@/league/components/LeagueExportSurvey';
import { LeagueExportSurveyIntro } from '@/league/components/LeagueExportSurveyIntro';
import { DexExportSettingsPane } from './DexExportSettingsPane';
import { ExportPreviewShell, type ExportPreviewPhase } from './ExportPreviewShell';
import { dexExportFrameKey, dexExportPermutations, type DexExportDraft } from './dexExportDraft';
import { useExportPreviewCache } from './useExportPreviewCache';

function seedDraft(): DexExportDraft {
  const s = usePokedexStore.getState();
  return {
    sort: s.viewSortOption,
    showSections: s.viewShowSections,
    groupSpecialAtEnd: s.viewGroupSpecialAtEnd,
    customOrder: s.viewCustomOrder,
    showStats: false,
  };
}

export function DexExportOverlay({ onClose }: { onClose: () => void }) {
  const sections = usePokedexStore((s) => s.sections);
  const [draft, setDraft] = useState<DexExportDraft>(seedDraft);
  const [phase, setPhase] = useState<ExportPreviewPhase>('settings');
  const [exportBusy, setExportBusy] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);
  const isDesktop = useViewportAtLeast(1024);
  const statsData = useDetailedStatsData();
  const statsDataRef = useRef(statsData);
  statsDataRef.current = statsData;

  const placedCount = Object.values(sections).flat().length;
  const statsEnabled = placedCount >= STATS_MIN_POKEMON;
  const sorted = useMemo(
    () => computeViewSort(sections, draft.sort, draft.groupSpecialAtEnd, draft.customOrder),
    [draft.customOrder, draft.groupSpecialAtEnd, draft.sort, sections],
  );
  const showSectionOverlays = draft.showSections && draft.sort === 'build-order';
  const showStatsPanel = draft.showStats && statsEnabled;
  const activeKey = dexExportFrameKey(draft);
  const seedCustomIds = useMemo(
    () => computeViewSort(sections, draft.sort, draft.groupSpecialAtEnd, draft.customOrder).map((p) => p.id),
    [draft.customOrder, draft.groupSpecialAtEnd, draft.sort, sections],
  );

  const jobs = useMemo(() => {
    const items = dexExportPermutations(draft, statsEnabled);
    const renderOne = (item: DexExportDraft) => {
      const rows = computeViewSort(sections, item.sort, item.groupSpecialAtEnd, item.customOrder);
      const outlines = item.showSections && item.sort === 'build-order';
      const stats = item.showStats && statsEnabled;
      return generateExportImage(rows, {
        sections: outlines ? sections : null,
        stats: stats ? { data: statsDataRef.current, heights: DEFAULT_STATS_HEIGHTS } : null,
      });
    };
    const mapped = items.map((item) => ({
      key: dexExportFrameKey(item),
      render: () => renderOne(item),
    }));
    return [...mapped.filter((job) => job.key === activeKey), ...mapped.filter((job) => job.key !== activeKey)];
  }, [activeKey, draft, sections, statsEnabled]);

  const { urls, busy } = useExportPreviewCache({
    enabled: phase === 'settings',
    activeKey,
    jobs,
  });

  const runExport = useCallback(async () => {
    if (exportBusy || sorted.length === 0) return;
    setExportBusy(true);
    const ids = sorted.map((p) => p.id);
    try {
      const nextHighlight = await sendExportBeacon(
        ids,
        {
          sort: draft.sort,
          outlines: showSectionOverlays,
          groupSpecial: draft.groupSpecialAtEnd,
          showStats: showStatsPanel,
        },
        sections,
      );
      setHighlight(nextHighlight);
      const cached = urls[activeKey];
      const blob = cached
        ? await fetch(cached).then((r) => r.blob())
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
    activeKey,
    draft.groupSpecialAtEnd,
    draft.sort,
    exportBusy,
    onClose,
    sections,
    showSectionOverlays,
    showStatsPanel,
    sorted,
    urls,
  ]);

  return (
    <ExportPreviewShell
      phase={phase}
      onClose={onClose}
      overlayMarker="data-dex-export-overlay"
      previewAlt="Pokedex export preview"
      frames={{ activeKey, urls, busy: busy || exportBusy }}
      settings={
        <DexExportSettingsPane
          draft={draft}
          onDraft={setDraft}
          placedCount={placedCount}
          seedCustomIds={seedCustomIds}
          busy={exportBusy || busy}
          onExport={() => void runExport()}
          onClose={onClose}
          mobileSheet={!isDesktop}
        />
      }
      surveyIntro={
        <LeagueExportSurveyIntro
          tool="pokedex"
          highlight={highlight}
          onContinue={() => setPhase('survey')}
          onSkip={onClose}
        />
      }
      survey={<LeagueExportSurvey exportKind="pokedex" openedAt={surveyOpenedAt} onDone={onClose} />}
    />
  );
}
