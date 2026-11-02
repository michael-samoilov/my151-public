import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLocale, useT, type Locale } from '@/i18n';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { cn } from '@/lib/utils';
import { showTipDot, type TipTarget } from './tipDots';

/** A tip offers an action, and the whole card is that action, or explains in a body, or both. */
type TipContent =
  | { action: string; onAction: () => void; body?: string }
  | { body: string; action?: never; onAction?: never };

type TipProps = TipContent & {
  /** Names the tip in `data-tip-card`. */
  id: string;
  target: TipTarget;
  /** Targets that get a dot once the person visits `target`. */
  then?: readonly TipTarget[];
  title: string;
  onDismiss: () => void;
};

type TipCardProps = TipProps & {
  /** The target button, whose glyph the card repeats. */
  anchor: Element | null;
  /** Where the notch points, in px from the card's left edge, or no notch. */
  notch: number | null;
  className?: string;
  style?: CSSProperties;
};

const EASE_IN = 'cubic-bezier(0.2, 0, 0, 1)';
const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
const HIDDEN: Keyframe = { opacity: 0, transform: 'translateY(-4px)' };
const SHOWN: Keyframe = { opacity: 1, transform: 'none' };
/** The gap between the target's bottom edge and the card, which the notch spans. */
const GAP_PX = 10;
/** The notch stays clear of the card's rounded corners. */
const NOTCH_INSET_PX = 14;
/** About two thirds of a second of frames to wait for a target that is still sliding in. */
const ATTACH_FRAMES = 40;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const SEGMENTED: readonly Locale[] = ['ja', 'zh-Hans', 'zh-Hant'];

/**
 * Japanese and Chinese have no spaces, so a browser may break a line inside a word
 * (WebKit and Chinese have no phrase-aware breaking). This puts the only break points
 * between phrases: a word with the punctuation and Japanese particles that follow it.
 * The text that holds it keeps all, so it breaks nowhere else.
 */
function phrases(text: string, locale: Locale): ReactNode {
  if (!SEGMENTED.includes(locale) || typeof Intl.Segmenter !== 'function') return text;
  const units: string[] = [];
  for (const { segment } of new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)) {
    const attaches = /^[\p{P}\s]/u.test(segment) || (locale === 'ja' && /^[\u3041-\u309F]+$/u.test(segment));
    if (attaches && units.length) units[units.length - 1] += segment;
    else units.push(segment);
  }
  return units.map((unit, i) => <Fragment key={i}>{i > 0 && <wbr />}{unit}</Fragment>);
}

/**
 * The tip's card: a copy of the target's glyph, a one-line title, then a red action line
 * or a body. The target gets its dot as the card mounts. The card never times out.
 */
export function TipCard({ id, target, then, title, onDismiss, anchor, notch, className, style, ...content }: TipCardProps) {
  const t = useT();
  const locale = useLocale();
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    showTipDot(target, then);
    if (!reducedMotion()) cardRef.current?.animate([HIDDEN, SHOWN], { duration: 240, easing: EASE_IN });
  }, [target, then]);

  useLayoutEffect(() => {
    const glyph = anchor?.querySelector('svg');
    if (!glyph || !iconRef.current) return;
    const copy = glyph.cloneNode(true) as SVGElement;
    copy.removeAttribute('class');
    copy.setAttribute('aria-hidden', 'true');
    iconRef.current.replaceChildren(copy);
  }, [anchor]);

  const dismiss = () => {
    const card = cardRef.current;
    if (!card || reducedMotion()) {
      onDismiss();
      return;
    }
    card.animate([SHOWN, HIDDEN], { duration: 180, easing: EASE_OUT, fill: 'forwards' }).finished.then(onDismiss, onDismiss);
  };

  const icon = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
      <span ref={iconRef} className="grid h-[1.125rem] w-[1.125rem] place-items-center [&>svg]:h-full [&>svg]:w-full" />
    </span>
  );
  const text = (
    <span className="flex min-w-0 flex-col">
      <span data-tip-title className="whitespace-nowrap text-sm font-semibold leading-5 text-foreground [word-break:auto-phrase] [&:lang(ko)]:break-keep">{title}</span>
      {content.body !== undefined && (
        <span data-tip-body className="max-w-[17rem] text-[0.8125rem] leading-[1.125rem] text-muted-foreground text-pretty [word-break:auto-phrase] [&:lang(ja)]:break-keep [&:lang(ko)]:break-keep [&:lang(zh)]:break-keep">{phrases(content.body, locale)}</span>
      )}
      {content.action !== undefined && (
        <span data-tip-action className="whitespace-nowrap text-[0.8125rem] font-semibold leading-[1.125rem] text-primary">
          {content.action}<span aria-hidden> ›</span>
        </span>
      )}
    </span>
  );

  return (
    <div
      ref={cardRef}
      role="status"
      data-testid="tip-card"
      data-tip-card={id}
      className={cn(
        'relative flex items-center rounded-xl border border-black/[0.09] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_16px_-6px_rgba(0,0,0,0.14)]',
        className,
      )}
      style={style}
    >
      {notch !== null && (
        <span
          aria-hidden
          className="absolute -top-[0.375rem] h-[0.6875rem] w-[0.6875rem] -translate-x-1/2 rotate-45 rounded-tl-[3px] border-l border-t border-black/[0.09] bg-card"
          style={{ left: notch }}
        />
      )}
      {content.action !== undefined ? (
        <button
          type="button"
          onClick={content.onAction}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch rounded-l-xl py-2.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          {icon}
          {text}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3">
          {icon}
          {text}
        </div>
      )}
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={dismiss}
        className="mx-1 grid h-8 w-8 shrink-0 cursor-pointer place-items-center self-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function visibleArea(r: DOMRect): number {
  const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  return r.left >= 0 && r.top >= 0 ? w * h : 0;
}

/** The on-screen copy of the target with the most visible area. A two-pane layout can hold one per pane. */
function pickVisibleTarget(target: TipTarget): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll(`[data-tip-target="${target}"]`)) {
    const area = visibleArea(el.getBoundingClientRect());
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}

/**
 * A tip that floats just below its target button, so the page never shifts for it.
 * It sizes to its content, so a long title keeps one line, and stays inside the page gutter.
 */
export function FloatingTip({ onAnchor, ...tip }: TipProps & { onAnchor?: (el: Element) => void }) {
  const [anchor, setAnchor] = useState<{ el: Element; rect: DOMRect } | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const onAnchorRef = useRef(onAnchor);
  useLayoutEffect(() => {
    onAnchorRef.current = onAnchor;
  });

  useLayoutEffect(() => {
    let raf = 0;
    let frames = 0;
    let revealed: Element | null = null;
    const capture = () => {
      const el = pickVisibleTarget(tip.target)
        ?? (frames > ATTACH_FRAMES ? document.querySelector(`[data-tip-target="${tip.target}"]`) : null);
      if (!el) {
        frames += 1;
        if (frames <= ATTACH_FRAMES + 1) raf = requestAnimationFrame(capture);
        return;
      }
      if (el !== revealed) {
        revealed = el;
        onAnchorRef.current?.(el);
      }
      const rect = el.getBoundingClientRect();
      setAnchor((cur) => (cur && cur.el === el && cur.rect.left === rect.left && cur.rect.bottom === rect.bottom ? cur : { el, rect }));
    };
    capture();
    window.addEventListener('resize', capture);
    window.addEventListener('scroll', capture, true);
    window.addEventListener('transitionend', capture, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', capture);
      window.removeEventListener('scroll', capture, true);
      window.removeEventListener('transitionend', capture, true);
    };
  }, [tip.target]);

  useLayoutEffect(() => {
    const card = cardRef.current?.firstElementChild;
    if (anchor && card instanceof HTMLElement) setWidth(card.offsetWidth);
  }, [anchor, tip.title, tip.action, tip.body]);

  if (!anchor) return null;
  const gutter = 0.75 * getAppliedRootFontSizePx();
  const center = anchor.rect.left + anchor.rect.width / 2;
  const w = width ?? 0;
  const left = Math.max(gutter, Math.min(center - w / 2, innerWidth - w - gutter));
  const notch = Math.max(NOTCH_INSET_PX, Math.min(center - left, w - NOTCH_INSET_PX));

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-[220]"
      style={{ left, top: anchor.rect.bottom + GAP_PX, visibility: width === null ? 'hidden' : undefined }}
    >
      <TipCard
        {...tip}
        anchor={anchor.el}
        notch={width === null ? null : notch}
        className="w-max max-w-[calc(100vw-1.5rem)]"
      />
    </div>,
    document.body,
  );
}
