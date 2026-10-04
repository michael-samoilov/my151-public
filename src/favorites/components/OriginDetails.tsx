import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '@/i18n';

/** Read-only origin details; dismissal never reaches the picker beneath it. */
export function OriginDetails({ name, trigger, onClose, children }: {
  name: string; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode;
}) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  const width = Math.min(280, window.innerWidth - 24);
  const left = (window.innerWidth - width) / 2;
  useEffect(() => {
    close.current?.focus();
    const triggerButton = trigger.current;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        close.current?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); triggerButton?.focus(); };
  }, [onClose, trigger]);
  return createPortal(<div data-picker-keep-open className="fixed inset-0 z-[220]">
    <div aria-hidden className="absolute inset-0" data-testid="favorites-origin-scrim"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} />
    <section role="dialog" aria-modal="true" aria-label={name} data-testid="favorites-origin-details"
      className="absolute flex max-h-[calc(100dvh-24px)] flex-col rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
      style={{ width, left, top: '50%', transform: 'translateY(-50%)' }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{name}</h3>
        <button ref={close} type="button" onClick={onClose} aria-label={t('favorites.origins.close')}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary">
          <X size={16} aria-hidden />
        </button>
      </div>
      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto text-xs">{children}</ul>
    </section>
  </div>, document.body);
}
