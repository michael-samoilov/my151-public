import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Settings list with an eased fade and a down-arrow when more content sits
 * below the fold. Pattern from shadcn MessageScroller: show what is out of
 * view, then jump toward it on tap.
 */
export function ExportSettingsScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(0);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
    setFade(remain <= 2 ? 0 : Math.min(1, remain / 56));
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [sync, children]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        onScroll={sync}
        className={cn('h-full min-h-0 overflow-y-auto overscroll-contain', className)}
        data-export-settings-scroll
      >
        {children}
      </div>
      <div
        aria-hidden
        data-export-scroll-fade
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background to-transparent transition-opacity duration-300 ease-out"
        style={{ opacity: fade }}
      />
      {fade > 0.15 && (
        <button
          type="button"
          data-export-scroll-more
          aria-label={t('export.moreSettings')}
          className="absolute bottom-1.5 left-1/2 z-10 -translate-x-1/2 cursor-pointer rounded-full bg-background/90 p-1 text-muted-foreground shadow-sm ring-1 ring-border transition-opacity duration-300 ease-out hover:text-foreground"
          style={{ opacity: fade }}
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.scrollBy({ top: Math.max(80, el.clientHeight * 0.6), behavior: 'smooth' });
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
