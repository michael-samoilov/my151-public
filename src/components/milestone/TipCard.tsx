import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { cn } from '@/lib/utils';
import { showTipDot, type TipTarget } from './tipDots';

/** A tip either offers an action, and the whole card is that action, or explains in a body line. */
type TipContent =
  | { action: string; onAction: () => void; body?: never }
  | { body: string; action?: never; onAction?: never };

type TipCardProps = TipContent & {
  /** Names the tip in `data-tip-card`. */
  id: string;
  target: TipTarget;
  title: string;
  onDismiss: () => void;
};

const OPEN_MS = 300;
const CLOSE_MS = 180;
/** About a second of frames to wait for the target to mount. */
const ATTACH_FRAMES = 60;
/** The notch stays clear of the card's rounded corners. */
const NOTCH_INSET_PX = 14;

/** The nearest button marked for `target`, searching outward from the slot, so each pane finds its own. */
function findTarget(from: Element, target: TipTarget): HTMLElement | null {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const found = node.querySelector<HTMLElement>(`[data-tip-target="${target}"]`);
    if (found) return found;
  }
  return null;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A tip in the page flow under the toolbar that holds its target. A notch points at the
 * target, the icon repeats the target's own glyph, and the target gets its dot as the
 * card appears. The card grows open, stays until the person acts on it, and never times out.
 * Render it where the tool's layout keeps its tip slot, directly under the toolbar.
 */
export function TipCard({ id, target, title, onDismiss, ...content }: TipCardProps) {
  const t = useT();
  const desktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [frame, setFrame] = useState<{ width: number; center: number } | null>(null);
  const [place, setPlace] = useState<{ left: number; notch: number } | null>(null);
  const [settled, setSettled] = useState(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let detach = () => {};
    // The target can mount a frame after the slot, as a toolbar portal does.
    const attach = (tries: number) => {
      const anchor = findTarget(root, target);
      if (!anchor) {
        if (tries < ATTACH_FRAMES) raf = requestAnimationFrame(() => attach(tries + 1));
        return;
      }
      const glyph = anchor.querySelector('svg');
      if (glyph && iconRef.current) {
        const copy = glyph.cloneNode(true) as SVGElement;
        copy.removeAttribute('class');
        copy.setAttribute('aria-hidden', 'true');
        iconRef.current.replaceChildren(copy);
      }
      const measure = () => {
        const slot = root.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const next = { width: slot.width, center: a.left + a.width / 2 - slot.left };
        setFrame((cur) => (cur && cur.width === next.width && cur.center === next.center ? cur : next));
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(root);
      observer.observe(anchor);
      if (anchor.parentElement) observer.observe(anchor.parentElement);
      window.addEventListener('resize', measure);
      detach = () => {
        observer.disconnect();
        window.removeEventListener('resize', measure);
      };
    };
    attach(0);
    return () => {
      cancelAnimationFrame(raf);
      detach();
    };
  }, [target]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const root = rootRef.current;
    if (!frame || !card || !root) return;
    const gutter = (desktop ? 1 : 0.75) * getAppliedRootFontSizePx();
    const width = card.offsetWidth;
    const left = Math.max(gutter, Math.min(frame.center - width / 2, frame.width - width - gutter));
    const notch = Math.max(NOTCH_INSET_PX, Math.min(frame.center - left, width - NOTCH_INSET_PX));
    // Commit the closed height first, so the first placement opens with a transition.
    void root.offsetHeight;
    setPlace((cur) => (cur && cur.left === left && cur.notch === notch ? cur : { left, notch }));
    showTipDot(target);
  }, [frame, desktop, title, content.action, content.body, target]);

  const placed = place !== null;
  useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(() => setSettled(true), reducedMotion() ? 0 : OPEN_MS);
    return () => window.clearTimeout(timer);
  }, [placed]);

  const dismiss = () => {
    if (reducedMotion()) {
      onDismiss();
      return;
    }
    setClosing(true);
    window.setTimeout(onDismiss, CLOSE_MS);
  };

  const shown = placed && !closing;
  const icon = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <span ref={iconRef} className="grid h-[1.125rem] w-[1.125rem] place-items-center [&>svg]:h-full [&>svg]:w-full" />
    </span>
  );
  const text = (detail: ReactNode) => (
    <span className="flex min-w-0 flex-col">
      <span data-tip-title className="whitespace-nowrap text-sm font-semibold leading-5 text-foreground">{title}</span>
      {detail}
    </span>
  );

  return (
    <div
      ref={rootRef}
      data-open={shown || undefined}
      data-closing={closing || undefined}
      className="grid grid-cols-[minmax(0,1fr)] grid-rows-[0fr] transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)] data-[open]:grid-rows-[1fr] data-[closing]:duration-[180ms] data-[closing]:ease-[cubic-bezier(0.4,0,1,1)] motion-reduce:transition-none"
    >
      <div className={cn('min-h-0', (!settled || closing) && 'overflow-hidden')}>
        <div className="pb-1 pt-2.5">
          <div
            ref={cardRef}
            role="status"
            data-testid="tip-card"
            data-tip-card={id}
            className={cn(
              'relative flex items-center rounded-xl border border-black/[0.09] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_16px_-6px_rgba(0,0,0,0.14)]',
              'transition-[opacity,transform] motion-reduce:transition-none',
              shown
                ? 'translate-y-0 opacity-100 delay-[60ms] duration-[240ms] ease-[cubic-bezier(0.2,0,0,1)]'
                : '-translate-y-1 opacity-0 duration-[120ms] ease-[cubic-bezier(0.4,0,1,1)]',
            )}
            style={{
              ...(desktop
                ? { width: 'max-content', minWidth: '18rem', maxWidth: 'min(30rem, 100% - 2rem)' }
                : { width: 'calc(100% - 1.5rem)' }),
              marginLeft: place?.left ?? 0,
              visibility: place ? undefined : 'hidden',
            }}
          >
            {place && (
              <span
                aria-hidden
                className="absolute -top-[0.375rem] h-[0.6875rem] w-[0.6875rem] -translate-x-1/2 rotate-45 rounded-tl-[3px] border-l border-t border-black/[0.09] bg-card"
                style={{ left: place.notch }}
              />
            )}
            {content.action !== undefined ? (
              <button
                type="button"
                onClick={content.onAction}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch rounded-l-xl py-2.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                {icon}
                {text(
                  <span data-tip-action className="whitespace-nowrap text-[0.8125rem] font-semibold leading-[1.125rem] text-primary">
                    {content.action}<span aria-hidden> ›</span>
                  </span>,
                )}
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3">
                {icon}
                {text(<span className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground text-pretty">{content.body}</span>)}
              </div>
            )}
            <button
              type="button"
              aria-label={t('common.dismiss')}
              onClick={dismiss}
              className="mx-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
