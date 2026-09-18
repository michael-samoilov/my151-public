import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import {
  createExportSurveySkipReporter,
  exportSurveySkipReason,
  markExportSurveySeen,
  type ExportSurveyTool,
} from '@/lib/exportSurvey';
import type { ExportHighlight } from '@/league/export/exportPersonalization';
import { LeagueExportSurvey } from '@/league/components/LeagueExportSurvey';
import { LeagueExportSurveyIntro } from '@/league/components/LeagueExportSurveyIntro';

const SCRIM_Z = 200;
const PANE_Z = 210;

/**
 * Standalone export follow-up for tools that do not already host the
 * league export overlay (today: the Pokedex view export).
 */
export function ExportSurveyHost({
  tool,
  highlight,
  openedAt,
  onClose,
}: {
  tool: ExportSurveyTool;
  highlight: ExportHighlight | null;
  openedAt: number;
  onClose: () => void;
}) {
  const isDesktop = useViewportAtLeast(1024);
  const [phase, setPhase] = useState<'intro' | 'form'>('intro');
  const [skipReporter] = useState(() =>
    createExportSurveySkipReporter({
      exportTool: tool,
      send: (event, payload) => sendEventBeacon(event, payload),
    }),
  );

  useEffect(() => {
    markExportSurveySeen();
  }, []);

  useEffect(() => {
    const onHide = () => skipReporter.onPageHide(phase);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [phase, skipReporter]);

  const dismiss = (action: 'not_now' | 'dismiss') => {
    skipReporter.skip(exportSurveySkipReason({ phase, action }));
    onClose();
  };

  const paneTitle = phase === 'intro' ? 'Your export' : 'Quick question';
  const paneBody =
    phase === 'intro' ? (
      <LeagueExportSurveyIntro
        tool={tool}
        highlight={highlight}
        onContinue={() => setPhase('form')}
        onSkip={() => dismiss('not_now')}
      />
    ) : (
      <LeagueExportSurvey
        exportKind={tool}
        openedAt={openedAt}
        onDone={() => {
          skipReporter.markSent();
          onClose();
        }}
      />
    );

  const scrim = createPortal(
    <div className="fixed inset-0" style={{ zIndex: SCRIM_Z }} data-export-scrim data-overlay>
      <div
        aria-hidden
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
        style={{ WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)' }}
      />
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label="Close export survey"
        onClick={() => dismiss('dismiss')}
      />
    </div>,
    document.body,
  );

  const pane = isDesktop
    ? createPortal(
        <aside
          role="dialog"
          aria-label={paneTitle}
          className="fixed inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.5rem))] max-h-full flex-col border-l bg-card shadow-xl"
          style={{ zIndex: PANE_Z }}
          data-export-survey-host
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
        </aside>,
        document.body,
      )
    : (
        <BottomSheet
          onClose={() => dismiss('dismiss')}
          title={paneTitle}
          closeLabel={paneTitle}
          size="content"
          topGap={56}
          layerZIndex={PANE_Z}
          showScrim={false}
          exportChrome
        >
          {paneBody}
        </BottomSheet>
      );

  return (
    <>
      {scrim}
      {pane}
    </>
  );
}
