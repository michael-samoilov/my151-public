import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { EXPORT_OVERLAY_SCRIM_CLASS, EXPORT_OVERLAY_SCRIM_STYLE } from '@/components/export/exportOverlayScrim';
import { DEFAULT_HOVER_TILT_RECIPE, type HoverTiltRecipe } from '@/components/export/hoverTiltRecipe';
import { DEFAULT_MASK_CONTEXT, type HoverTiltMaskContext } from '@/components/export/hoverTiltMasks';
import { DEFAULT_FOIL_RECIPE, type FoilRecipe } from '@/league/export/foilRecipe';
import {
  createExportSurveySkipReporter,
  exportSurveySkipReason,
  type ExportSurveySkipAction,
  type ExportSurveyTool,
} from '@/lib/exportSurvey';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { useT } from '@/i18n';

export type ExportPreviewPhase = 'settings' | 'surveyIntro' | 'survey';

const SCRIM_Z = 200;
const PREVIEW_Z = 201;
const PANE_Z = 210;
const SETTINGS_SHEET_FRACTION = 0.45;

type ExportSurveyActions = {
  dismiss: (action: ExportSurveySkipAction) => void;
  finish: () => void;
};

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

function ExportScrim({ onClose, closeLabel }: { onClose: () => void; closeLabel: string }) {
  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: SCRIM_Z }} data-export-scrim data-overlay>
      <div
        aria-hidden
        className={EXPORT_OVERLAY_SCRIM_CLASS}
        style={EXPORT_OVERLAY_SCRIM_STYLE}
      />
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-transparent"
        aria-label={closeLabel}
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

/**
 * Shared export chrome for Dex, league, and gym-leader card.
 * Each tool supplies the settings node, survey nodes, and preview frames.
 */
export function ExportPreviewShell({
  phase,
  onClose,
  surveyTool,
  settings,
  surveyIntro,
  survey,
  previewAlt,
  frames,
  overlayMarker,
  maskContext = DEFAULT_MASK_CONTEXT,
  recipe = DEFAULT_FOIL_RECIPE,
  tilt = DEFAULT_HOVER_TILT_RECIPE,
  bare = false,
  settingsTitle,
  closeLabel: closeLabelProp,
}: {
  phase: ExportPreviewPhase;
  onClose: () => void;
  surveyTool?: ExportSurveyTool;
  settings: ReactNode;
  surveyIntro: (actions: ExportSurveyActions) => ReactNode;
  survey: (actions: ExportSurveyActions) => ReactNode;
  previewAlt: string;
  frames: { activeKey: string; urls: Record<string, string>; busy: boolean };
  overlayMarker?: string;
  maskContext?: HoverTiltMaskContext;
  recipe?: FoilRecipe;
  tilt?: HoverTiltRecipe;
  /**
   * The export has no settings: its pane holds only `ExportNoSettings` and the
   * actions, so the phone sheet sizes to them and the preview gets the rest.
   */
  bare?: boolean;
  settingsTitle?: string;
  closeLabel?: string;
}) {
  const t = useT();
  const closeLabel = closeLabelProp ?? t('export.close');
  const isDesktop = useViewportAtLeast(1024);
  const sheetCap = useSettingsSheetCap(!isDesktop && phase === 'settings');
  const chrome = useExportChrome(isDesktop);
  const [skipReporter] = useState(() =>
    surveyTool ? createExportSurveySkipReporter({
      exportTool: surveyTool,
      send: (event, payload) => sendEventBeacon(event, payload),
    }) : null,
  );
  const surveyPhase = phase === 'survey' ? 'form' : 'intro';

  useEffect(() => {
    if (phase === 'settings') return;
    const onHide = () => skipReporter?.onPageHide(surveyPhase);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [phase, skipReporter, surveyPhase]);

  const dismissSurvey = (action: ExportSurveySkipAction) => {
    skipReporter?.skip(exportSurveySkipReason({ phase: surveyPhase, action }));
    onClose();
  };
  const finishSurvey = () => {
    skipReporter?.markSent();
    onClose();
  };
  const surveyActions = { dismiss: dismissSurvey, finish: finishSurvey };
  const closeOverlay = phase === 'settings' ? onClose : () => dismissSurvey('dismiss');
  const paneTitle =
    phase === 'settings'
      ? settingsTitle ?? t('export.title')
      : t(phase === 'surveyIntro' ? 'exportSurvey.introTitle' : 'exportSurvey.title');
  const paneBody =
    phase === 'settings'
      ? settings
      : phase === 'surveyIntro'
        ? surveyIntro(surveyActions)
        : survey(surveyActions);
  const activeSrc = frames.urls[frames.activeKey] ?? null;

  const settingsPane = isDesktop ? (
    createPortal(
      <aside
        role="dialog"
        aria-label={paneTitle}
        className="fixed inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.5rem))] max-h-full flex-col border-l bg-card shadow-xl"
        style={{ zIndex: PANE_Z }}
        data-export-overlay
        data-export-chrome
        data-export-shell
        {...(overlayMarker ? { [overlayMarker]: '' } : {})}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{paneBody}</div>
      </aside>,
      document.body,
    )
  ) : (
    <BottomSheet
      onClose={closeOverlay}
      title={paneTitle}
      closeLabel={phase === 'settings' ? closeLabel : paneTitle}
      size="content"
      topGap={56}
      layerZIndex={PANE_Z}
      showScrim={false}
      exportChrome
      capHeightPx={sheetCap}
      fitContent={bare && phase === 'settings'}
    >
      {paneBody}
    </BottomSheet>
  );

  return (
    <>
      <ExportScrim onClose={closeOverlay} closeLabel={closeLabel} />
      {phase === 'settings' &&
        createPortal(
          <div
            className="pointer-events-none fixed flex min-h-0 min-w-0 items-center justify-center overflow-visible p-[8px]"
            style={{
              zIndex: PREVIEW_Z,
              top: 0,
              left: 0,
              right: isDesktop ? chrome.w : 0,
              bottom: isDesktop ? 0 : chrome.h,
            }}
            data-export-preview-layer
          >
            <div className="grid h-full w-full min-h-0 min-w-0 place-items-center overflow-visible">
              <ExportPreview3D
                src={activeSrc}
                frames={frames}
                alt={previewAlt}
                busy={frames.busy}
                recipe={recipe}
                tilt={tilt}
                maskContext={maskContext}
              />
            </div>
          </div>,
          document.body,
        )}
      {settingsPane}
    </>
  );
}
