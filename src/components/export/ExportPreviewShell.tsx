import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ExportPreview3D } from '@/league/components/ExportPreview3D';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';

export type ExportPreviewPhase = 'settings' | 'surveyIntro' | 'survey';

const SCRIM_Z = 200;
const PREVIEW_Z = 201;
const PANE_Z = 210;
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

/**
 * Shared export chrome for Dex, league, and gym-leader card.
 * Each tool supplies the settings node, survey nodes, and preview frames.
 */
export function ExportPreviewShell({
  phase,
  onClose,
  settings,
  surveyIntro,
  survey,
  previewAlt,
  frames,
  overlayMarker,
}: {
  phase: ExportPreviewPhase;
  onClose: () => void;
  settings: ReactNode;
  surveyIntro: ReactNode;
  survey: ReactNode;
  previewAlt: string;
  frames: { activeKey: string; urls: Record<string, string>; busy: boolean };
  overlayMarker?: string;
}) {
  const isDesktop = useViewportAtLeast(1024);
  const sheetCap = useSettingsSheetCap(!isDesktop && phase === 'settings');
  const chrome = useExportChrome(isDesktop);
  const paneTitle =
    phase === 'settings' ? 'Export' : phase === 'surveyIntro' ? 'Your export' : 'Quick question';
  const paneBody = phase === 'settings' ? settings : phase === 'surveyIntro' ? surveyIntro : survey;
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
            <div className="grid h-full w-full min-h-0 min-w-0 place-items-center">
              <ExportPreview3D
                src={activeSrc}
                frames={frames}
                alt={previewAlt}
                busy={frames.busy}
              />
            </div>
          </div>,
          document.body,
        )}
      {settingsPane}
    </>
  );
}
