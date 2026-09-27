import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowUpDown, Info, RotateCcw, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useAnchoredCard } from '@/hooks/useAnchoredCard';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { LaurelIcon } from './LaurelIcon';

/**
 * The trainer card's instructions: an info button in the card's own bar, and
 * the popup it opens.
 *
 * The card has three gestures that show nothing until you try them: a drag up
 * or down, a press-and-hold sideways, and a tap on the boss row. The one-line
 * hints under the card name them in small grey type at the card's foot; this
 * names them again at the top, beside the card's other control, with a line of
 * detail each.
 *
 * Mobile gets the app's bottom sheet and desktop a card anchored to the button,
 * the same split the feedback form uses.
 */

const TITLE = 'How to edit this card';

/**
 * The blue reset disc a moved line wears (`CardGrid`'s reset control, same
 * blue), drawn inline so the words point at the thing on the card.
 */
function ResetDisc() {
  return (
    <span
      aria-hidden
      className="mx-[0.0625rem] inline-grid h-[1.1em] w-[1.1em] place-items-center rounded-full align-[-0.2em] text-white"
      style={{ background: '#2563eb' }}
    >
      <RotateCcw className="h-[0.7em] w-[0.7em]" strokeWidth={3} />
    </span>
  );
}

interface Gesture {
  id: 'evolve' | 'reorder' | 'legend';
  /** The same marks the hints under the card use, so the two read as one set. */
  Icon: ComponentType<{ className?: string }>;
  title: string;
  body: ReactNode;
}

const GESTURES: Gesture[] = [
  {
    id: 'evolve',
    Icon: ArrowUpDown,
    title: 'Change when it evolves',
    body: (
      <>
        Drag a Pokémon up or down its column to change the gym where it evolves. Tap the{' '}
        {/* Kept on one line with its words, so a wrap never starts a line on the disc. */}
        <span className="whitespace-nowrap">
          blue <ResetDisc /> to undo.
        </span>
      </>
    ),
  },
  {
    id: 'reorder',
    Icon: ArrowLeftRight,
    title: 'Reorder your team',
    body: 'Press and hold a Pokémon, then drag it left or right. Its whole column moves.',
  },
  {
    id: 'legend',
    Icon: LaurelIcon,
    title: 'Add an Endgame legendary',
    body: 'Tap a Pokémon in the Endgame Boss row to swap in a legendary. Only that row changes. Drag the legendary to another column to move it.',
  },
];

function GestureList() {
  return (
    <ul className="flex flex-col gap-3.5">
      {GESTURES.map(({ id, Icon, title, body }) => (
        <li key={id} data-league-help-item={id} className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug">{title}</h3>
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground text-pretty">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus in, keep it in, and on desktop let Escape out.
 *
 * `start` is the element that takes focus when the popup opens. Tab and
 * Shift+Tab wrap inside the dialog that holds it, so a keyboard user does not
 * walk into the page behind a popup a click outside would close. Mobile's
 * Escape belongs to the bottom sheet, which already handles it.
 */
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
  useDialogFocus(isDesktop ? cardRef : bodyRef, onClose, isDesktop);

  if (!isDesktop) {
    return (
      <BottomSheet onClose={onClose} title={TITLE} closeLabel={TITLE}>
        <div ref={bodyRef} tabIndex={-1} className="px-4 pb-4 pt-3 outline-none">
          <GestureList />
          <Button type="button" onClick={onClose} className="mt-4 w-full">
            Got it
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
            {TITLE}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
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

/**
 * The info button. It sits left of the card's export button and wears the same
 * box, in the muted colour, so export stays the bar's one red control.
 */
export function CardHelpButton() {
  // The button that opened the popup, which is also the open flag: the desktop
  // card anchors to it, and focus goes back to it on close.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => {
    anchor?.focus({ preventScroll: true });
    setAnchor(null);
  }, [anchor]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={TITLE}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-league-help="card"
        className="shrink-0 cursor-pointer rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Info className="h-4 w-4" />
      </button>
      {anchor && <CardHelpDialog anchor={anchor} onClose={close} />}
    </>
  );
}
