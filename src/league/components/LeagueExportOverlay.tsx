import { useCallback, useMemo, useState } from 'react';
import { ExportPreviewShell, type ExportPreviewPhase } from '@/components/export/ExportPreviewShell';
import { useExportPreviewCache } from '@/components/export/useExportPreviewCache';
import { shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen, shouldShowExportSurvey } from '@/lib/exportSurvey';
import { isOptedOut } from '@/lib/clientId';
import { PREVIEW_DEPLOY } from '@/lib/demoMode';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import {
  CARD_FILENAME,
  HOME_FILENAME,
  exportGymCard,
  exportLeagueHome,
} from '../export/exportLeague';
import {
  leagueLayoutFrameKey,
  leagueLayoutPermutations,
  parseLeagueHomeExportLayout,
  type LeagueHomeExportLayout,
} from '../export/exportOptions';
import {
  exportPokemonIds,
  incrementLeagueExportCount,
  type ExportHighlight,
} from '../export/exportPersonalization';
import { sendLeagueExportBeacon } from '../hooks/useLeagueBeacon';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
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
  const [exportBusy, setExportBusy] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);

  const activeKey = isLeague ? leagueLayoutFrameKey(layout) : `card:${exportCardIndex ?? 0}`;
  const jobs = useMemo(() => {
    if (!isLeague) {
      return [
        {
          key: activeKey,
          render: async () => {
            const { cards } = useLeagueStore.getState();
            return exportGymCard(cards[exportCardIndex!]);
          },
        },
      ];
    }
    return leagueLayoutPermutations(layout).map((item) => ({
      key: leagueLayoutFrameKey(item),
      render: async () => {
        const { name, cards, view } = useLeagueStore.getState();
        return exportLeagueHome(name, cards, view, item);
      },
    }));
  }, [activeKey, exportCardIndex, isLeague, layout]);

  const { urls, busy } = useExportPreviewCache({
    enabled: exportPhase === 'settings',
    activeKey,
    jobs,
  });

  const runExport = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    sendEventBeacon(isLeague ? 'league-export-league' : 'league-export-card');
    try {
      const { name, cards, view } = useLeagueStore.getState();
      const ids = exportPokemonIds(isLeague ? cards : [cards[exportCardIndex!]]);
      const nextHighlight = await sendLeagueExportBeacon(exportKind, ids);
      setHighlight(nextHighlight);
      const cached = urls[activeKey];
      const blob = cached
        ? await fetch(cached).then((r) => r.blob())
        : isLeague
          ? await exportLeagueHome(name, cards, view, layout)
          : await exportGymCard(cards[exportCardIndex!]);
      await shareOrDownload(blob, isLeague ? HOME_FILENAME : CARD_FILENAME);
      incrementLeagueExportCount();
      if (
        !shouldShowExportSurvey({
          optedOut: isOptedOut(),
          preview: PREVIEW_DEPLOY,
          seen: hasSeenExportSurvey(),
          ordinal: nextHighlight?.ordinal,
        })
      ) {
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
  }, [
    activeKey,
    closeLeagueExport,
    exportBusy,
    exportCardIndex,
    exportKind,
    isLeague,
    layout,
    setExportPhase,
    urls,
  ]);

  return (
    <ExportPreviewShell
      phase={exportPhase}
      onClose={closeLeagueExport}
      previewAlt={isLeague ? 'League export preview' : 'Trainer card export preview'}
      frames={{ activeKey, urls, busy: busy || exportBusy }}
      settings={
        <LeagueExportSettingsPane
          isLeague={isLeague}
          layout={layout}
          onLayout={setLayout}
          busy={exportBusy || busy}
          onExport={() => void runExport()}
          onClose={closeLeagueExport}
          mobileSheet={!isDesktop}
        />
      }
      surveyIntro={
        <LeagueExportSurveyIntro
          tool={exportKind}
          highlight={highlight}
          onContinue={() => setExportPhase('survey')}
          onSkip={closeLeagueExport}
        />
      }
      survey={
        <LeagueExportSurvey
          exportKind={exportKind}
          openedAt={surveyOpenedAt}
          onDone={closeLeagueExport}
        />
      }
    />
  );
}

export type { ExportPreviewPhase };
