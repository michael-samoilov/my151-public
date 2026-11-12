import { useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useT } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';

export const PANEL_HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export function FooterPanel({ title, anchor, onClose, children }: {
  title: string;
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const isDesktop = useViewportAtLeast(1024);

  const close = useCallback(() => {
    onClose();
    anchor?.focus({ preventScroll: true });
  }, [anchor, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  if (!isDesktop) {
    return (
      <BottomSheet onClose={close} title={title} closeLabel={title} size="full">
        {children}
      </BottomSheet>
    );
  }

  return createPortal(
    <div data-overlay>
      <div className="fixed inset-0 z-[140] bg-black/20" onClick={close} aria-hidden />
      <aside
        role="dialog"
        aria-label={title}
        className="fixed inset-y-0 end-0 z-[150] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col border-s bg-background shadow-xl"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <button
            type="button"
            onClick={close}
            className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t('browser.close')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
