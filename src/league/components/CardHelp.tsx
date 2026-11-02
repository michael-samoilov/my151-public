import { HeaderActionButton } from '@/components/ui/HeaderActionButton';
import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowUpDown, Info, RotateCcw, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useAnchoredCard } from '@/hooks/useAnchoredCard';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { raw, useT, type NoArgKey } from '@/i18n';
import { splitTemplate } from '@/lib/richTemplate';
import { ArceusCrestIcon } from './ArceusCrestIcon';

// platform: Inter's cap height sits 0.09em above the x-height centre that `align-middle` uses, so the disc lifts to centre on the capitals.
function ResetDisc() {
  return (
    <span
      aria-hidden
      className="relative -top-[0.09em] mx-[0.0625rem] inline-grid h-[1.1em] w-[1.1em] place-items-center rounded-full align-middle text-white"
      style={{ background: '#2563eb' }}
    >
      <RotateCcw className="h-[0.7em] w-[0.7em]" strokeWidth={3} />
    </span>
  );
}

interface Gesture {
  id: 'evolve' | 'reorder' | 'legend';
  Icon: ComponentType<{ className?: string }>;
  title: NoArgKey;
  body: () => ReactNode;
}

function EvolveBody() {
  return (
    <>
      {splitTemplate(raw('league.help.evolve.body')).map((part, i) =>
        part.kind === 'literal' ? (
          part.text
        ) : (
          <span key={i} className="whitespace-nowrap">
            {splitTemplate(raw('league.help.evolve.undo')).map((run, j) =>
              run.kind === 'literal' ? run.text : <ResetDisc key={j} />,
            )}
          </span>
        ),
      )}
    </>
  );
}

const GESTURES: Gesture[] = [
  {
    id: 'evolve',
    Icon: ArrowUpDown,
    title: 'league.help.evolve.title',
    body: () => <EvolveBody />,
  },
  {
    id: 'reorder',
    Icon: ArrowLeftRight,
    title: 'league.help.reorder.title',
    body: () => raw('league.help.reorder.body'),
  },
  {
    id: 'legend',
    Icon: ArceusCrestIcon,
    title: 'league.help.legend.title',
    body: () => raw('league.help.legend.body'),
  },
];

function GestureList() {
  const t = useT();
  return (
    <ul className="flex flex-col gap-3.5">
      {GESTURES.map(({ id, Icon, title, body }) => (
        <li key={id} data-league-help-item={id} className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug">{t(title)}</h3>
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground text-pretty [word-break:auto-phrase]">{body()}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogFocus(
  start: RefObject<HTMLElement | null>,
  onClose: () => void,
  escapeCloses: boolean,
) {
  useEffect(() => {
    const el = start.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const root = el.closest<HTMLElement>('[role="dialog"]') ?? el;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escapeCloses) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [start, onClose, escapeCloses]);
}

function CardHelpDialog({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const isDesktop = useIsDesktop();
  const cardRef = useAnchoredCard(anchor, isDesktop);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const t = useT();
  const title = t('league.help.title');
  useDialogFocus(isDesktop ? cardRef : bodyRef, onClose, isDesktop);

  if (!isDesktop) {
    return (
      <BottomSheet onClose={onClose} title={title} closeLabel={title}>
        <div ref={bodyRef} tabIndex={-1} className="px-4 pb-4 pt-3 outline-none">
          <GestureList />
          <Button type="button" onClick={onClose} className="mt-4 w-full">
            {t('league.help.ok')}
          </Button>
        </div>
      </BottomSheet>
    );
  }

  // Portalled: the card pane is its own stacking context (`relative z-20`), so
  // a popup left inside it could not rise above the league pane beside it.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[140]" onClick={onClose} aria-hidden />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed z-[150] flex max-h-[80vh] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-y-auto overscroll-contain rounded-lg border bg-card shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-3">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('league.close')}
            className="-me-1 -mt-0.5 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pb-4 pt-3">
          <GestureList />
        </div>
      </div>
    </>,
    document.body,
  );
}

export function CardHelpButton() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const t = useT();
  const close = useCallback(() => {
    anchor?.focus({ preventScroll: true });
    setAnchor(null);
  }, [anchor]);

  return (
    <>
      <HeaderActionButton
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t('league.help.title')}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-league-help="card"
        className="text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </HeaderActionButton>
      {anchor && <CardHelpDialog anchor={anchor} onClose={close} />}
    </>
  );
}
