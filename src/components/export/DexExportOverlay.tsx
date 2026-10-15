import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateExportImage, shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen, shouldShowExportSurvey } from '@/lib/exportSurvey';
import { isOptedOut } from '@/lib/clientId';
import { PREVIEW_DEPLOY } from '@/lib/demoMode';
import { sendExportBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { useT } from '@/i18n';
import { usePokedexStore } from '@/store/usePokedexStore';
import { computeViewSort } from '@/hooks/useViewSort';
import { DEFAULT_STATS_HEIGHTS, STATS_MIN_POKEMON } from '@/components/view/DetailedStatsPanel';
import { useDetailedStatsData } from '@/components/view/useDetailedStatsData';
import { previewExportHighlight, type ExportHighlight } from '@/league/export/exportPersonalization';
import { DEFAULT_FOIL_RECIPE, cloneFoilRecipe, type FoilRecipe } from '@/league/export/foilRecipe';
import { LeagueExportSurvey } from '@/league/components/LeagueExportSurvey';
import { LeagueExportSurveyIntro } from '@/league/components/LeagueExportSurveyIntro';
import { DexExportSettingsPane } from './DexExportSettingsPane';
import {
  DEFAULT_HOVER_TILT_RECIPE,
  cloneHoverTiltRecipe,
  type HoverTiltRecipe,
} from './hoverTiltRecipe';
import { hoverTiltMaskContextFromDex } from './hoverTiltMasks';
import { ExportPreviewShell, type ExportPreviewPhase } from './ExportPreviewShell';
import { dexExportFrameKey, dexExportLiveJobs, type DexExportDraft } from './dexExportDraft';
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
  const t = useT();
  const sections = usePokedexStore((s) => s.sections);
  const [draft, setDraft] = useState<DexExportDraft>(seedDraft);
  const [recipe] = useState<FoilRecipe>(() => cloneFoilRecipe(DEFAULT_FOIL_RECIPE));
  const [tilt] = useState<HoverTiltRecipe>(() => cloneHoverTiltRecipe(DEFAULT_HOVER_TILT_RECIPE));
  const [phase, setPhase] = useState<ExportPreviewPhase>('settings');
  const [exportBusy, setExportBusy] = useState(false);
  // A failed save says so in the pane; the next try clears it.
  const [exportFailed, setExportFailed] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);
  const isDesktop = useViewportAtLeast(1024);
  const statsData = useDetailedStatsData();
  const statsDataRef = useRef(statsData);
  useEffect(() => {
    statsDataRef.current = statsData;
  }, [statsData]);

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
    const items = dexExportLiveJobs(draft);
    const renderOne = (item: DexExportDraft) => {
      const rows = computeViewSort(sections, item.sort, item.groupSpecialAtEnd, item.customOrder);
      const outlines = item.showSections && item.sort === 'build-order';
      const stats = item.showStats && statsEnabled;
      return generateExportImage(rows, {
        sections: outlines ? sections : null,
        stats: stats ? { data: statsDataRef.current, heights: DEFAULT_STATS_HEIGHTS } : null,
      });
    };
    return items.map((item) => ({
      key: dexExportFrameKey(item),
      render: () => renderOne(item),
    }));
  }, [draft, sections, statsEnabled]);

  const { urls, busy } = useExportPreviewCache({
    enabled: phase === 'settings',
    activeKey,
    jobs,
  });

  const runExport = useCallback(async () => {
    if (exportBusy || sorted.length === 0) return;
    setExportBusy(true);
    setExportFailed(false);
    const ids = sorted.map((p) => p.id);
    let highlightTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const cached = urls[activeKey];
      const blob = cached
        ? await fetch(cached).then((r) => r.blob())
        : await generateExportImage(sorted, {
            sections: showSectionOverlays ? sections : null,
            stats: showStatsPanel ? { data: statsDataRef.current, heights: DEFAULT_STATS_HEIGHTS } : null,
          });
      await shareOrDownload(blob, 'my151.png');
      const nextHighlight = (await Promise.race([
        sendExportBeacon(
          ids,
          {
            sort: draft.sort,
            outlines: showSectionOverlays,
            groupSpecial: draft.groupSpecialAtEnd,
            showStats: showStatsPanel,
          },
          sections,
        ).catch(() => null),
        new Promise<null>(resolve => { highlightTimeout = setTimeout(() => resolve(null), 2000); }),
      ])) ?? previewExportHighlight('pokedex', ids);
      if (!mounted.current) return;
      setHighlight(nextHighlight);
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
      if (mounted.current) setExportFailed(true);
    } finally {
      if (highlightTimeout !== undefined) clearTimeout(highlightTimeout);
      if (mounted.current) setExportBusy(false);
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

  const maskContext = useMemo(
    () => hoverTiltMaskContextFromDex(sorted, showSectionOverlays ? sections : null),
    [sections, showSectionOverlays, sorted],
  );

  return (
    <ExportPreviewShell
      phase={phase}
      onClose={onClose}
      surveyTool="pokedex"
      overlayMarker="data-dex-export-overlay"
      previewAlt={t('export.preview.dex')}
      frames={{ activeKey, urls, busy: busy || exportBusy }}
      maskContext={maskContext}
      recipe={recipe}
      tilt={tilt}
      settings={
        <DexExportSettingsPane
          draft={draft}
          onDraft={setDraft}
          placedCount={placedCount}
          seedCustomIds={seedCustomIds}
          busy={exportBusy || busy}
          onExport={() => void runExport()}
          failed={exportFailed}
          onClose={onClose}
          mobileSheet={!isDesktop}
        />
      }
      surveyIntro={({ dismiss }) => (
        <LeagueExportSurveyIntro
          tool="pokedex"
          highlight={highlight}
          onContinue={() => setPhase('survey')}
          onSkip={() => dismiss('not_now')}
        />
      )}
      survey={({ finish }) => (
        <LeagueExportSurvey exportKind="pokedex" openedAt={surveyOpenedAt} onDone={finish} />
      )}
    />
  );
}
