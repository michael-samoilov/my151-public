import { useCallback, useMemo, useState } from 'react';
import { ExportPreviewShell, type ExportPreviewPhase } from '@/components/export/ExportPreviewShell';
import { useExportPreviewCache } from '@/components/export/useExportPreviewCache';
import { leagueExportEventBody } from '../../../api/_events';
import { isShareAbort, shareOrDownload } from '@/lib/exportImage';
import { hasSeenExportSurvey, markExportSurveySeen, shouldShowExportSurvey } from '@/lib/exportSurvey';
import { isOptedOut } from '@/lib/clientId';
import { PREVIEW_DEPLOY } from '@/lib/demoMode';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { useT } from '@/i18n';
import {
  CARD_FILENAME,
  HOME_FILENAME,
  leagueLayoutFrameKey,
  leagueLayoutPermutations,
  parseLeagueHomeExportLayout,
  type LeagueHomeExportLayout,
  type CardTeamOrder,
} from '../export/exportOptions';
import {
  exportPokemonIds,
  incrementLeagueExportCount,
  previewExportHighlight,
  type ExportHighlight,
} from '../export/exportPersonalization';
import { sendLeagueExportBeacon } from '../hooks/useLeagueBeacon';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { LeagueExportSettingsPane } from './LeagueExportSettingsPane';
import { LeagueExportSurvey } from './LeagueExportSurvey';
import { LeagueExportSurveyIntro } from './LeagueExportSurveyIntro';

export function LeagueExportOverlay() {
  const t = useT();
  const exportCardIndex = useLeagueUi((s) => s.exportCardIndex);
  const exportPhase = useLeagueUi((s) => s.exportPhase);
  const closeLeagueExport = useLeagueUi((s) => s.closeLeagueExport);
  const setExportPhase = useLeagueUi((s) => s.setExportPhase);
  const isDesktop = useViewportAtLeast(1024);
  const isLeague = exportCardIndex === null;
  const exportKind = isLeague ? 'league' : 'card';

  const [layout, setLayout] = useState<LeagueHomeExportLayout>(() =>
    parseLeagueHomeExportLayout(
      window.location.search,
      useLeagueStore.getState().view === 'rematch' ? 'rematch' : 'story',
    ),
  );
  const [cardTeamOrder, setCardTeamOrder] = useState<CardTeamOrder>('fixed');
  const [exportBusy, setExportBusy] = useState(false);
  // A failed save says so in the pane; the next try clears it.
  const [exportFailed, setExportFailed] = useState(false);
  const [highlight, setHighlight] = useState<ExportHighlight | null>(null);
  const [surveyOpenedAt, setSurveyOpenedAt] = useState(0);

  const activeKey = isLeague ? leagueLayoutFrameKey(layout) : `card:${exportCardIndex ?? 0}:${cardTeamOrder}`;
  const jobs = useMemo(() => {
    if (!isLeague) {
      return (['fixed', 'first-last'] as const).map((order) => ({
        key: `card:${exportCardIndex ?? 0}:${order}`,
        render: async () => {
          const { cards } = useLeagueStore.getState();
          const { exportGymCard } = await import('../export/exportLeague');
          return exportGymCard(cards[exportCardIndex!], order);
        },
      }));
    }
    return leagueLayoutPermutations(layout).map((item) => ({
      key: leagueLayoutFrameKey(item),
      render: async () => {
        const { name, cards, view } = useLeagueStore.getState();
        const { exportLeagueHome } = await import('../export/exportLeague');
        return exportLeagueHome(name, cards, view, item);
      },
    }));
  }, [exportCardIndex, isLeague, layout]);

  const { urls, busy } = useExportPreviewCache({
    enabled: exportPhase === 'settings',
    activeKey,
    jobs,
  });

  const runExport = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportFailed(false);
    try {
      const { name, cards, view } = useLeagueStore.getState();
      const ids = exportPokemonIds(isLeague ? cards : [cards[exportCardIndex!]]);
      const cached = urls[activeKey];
      let blob: Blob;
      if (cached) {
        blob = await fetch(cached).then((r) => r.blob());
      } else {
        const { exportLeagueHome, exportGymCard } = await import('../export/exportLeague');
        blob = isLeague
          ? await exportLeagueHome(name, cards, view, layout)
          : await exportGymCard(cards[exportCardIndex!], cardTeamOrder);
      }
      await shareOrDownload(blob, isLeague ? HOME_FILENAME : CARD_FILENAME);
      incrementLeagueExportCount();
      const { event, exportTool } = leagueExportEventBody(exportKind);
      sendEventBeacon(event, { exportTool });
      const nextHighlight =
        (await sendLeagueExportBeacon(exportKind, ids)) ?? previewExportHighlight(exportKind, ids);
      setHighlight(nextHighlight);
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
      if (isShareAbort(err)) return;
      console.error('League export failed:', err);
      setExportFailed(true);
    } finally {
      setExportBusy(false);
    }
  }, [
    activeKey,
    closeLeagueExport,
    exportBusy,
    exportCardIndex,
    cardTeamOrder,
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
      surveyTool={exportKind}
      previewAlt={t(isLeague ? 'leagueExport.preview.league' : 'leagueExport.preview.card')}
      frames={{ activeKey, urls, busy: busy || exportBusy }}
      bare={!isLeague}
      settings={
        <LeagueExportSettingsPane
          isLeague={isLeague}
          layout={layout}
          onLayout={setLayout}
          cardTeamOrder={cardTeamOrder}
          onCardTeamOrder={setCardTeamOrder}
          busy={exportBusy || busy}
          onExport={() => void runExport()}
          failed={exportFailed}
          onClose={closeLeagueExport}
          mobileSheet={!isDesktop}
        />
      }
      surveyIntro={({ dismiss }) => (
        <LeagueExportSurveyIntro
          tool={exportKind}
          highlight={highlight}
          onContinue={() => setExportPhase('survey')}
          onSkip={() => dismiss('not_now')}
        />
      )}
      survey={({ finish }) => (
        <LeagueExportSurvey
          exportKind={exportKind}
          openedAt={surveyOpenedAt}
          onDone={finish}
        />
      )}
    />
  );
}

export type { ExportPreviewPhase };
