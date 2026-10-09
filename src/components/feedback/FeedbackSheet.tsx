import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { Check, Languages, Lightbulb, MessageCircle, X } from 'lucide-react';
import { BugIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSheetKeyboard } from '@/components/ui/sheetKeyboard';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { useAnchoredCard } from '@/hooks/useAnchoredCard';
import type { FeedbackAnchor } from '@/components/feedback/feedbackChannel';
import {
  collectFeedbackContext,
  sendFeedback,
  type FeedbackCategory,
  type FeedbackContext,
  type FeedbackToolContext,
} from '@/lib/feedbackContext';
import type { NoArgKey } from '@/i18n';

/**
 * The report form.
 *
 * Categories are chips, not a `<select>`: four options is below the width where
 * a dropdown earns its collapse, and a chip row shows the whole vocabulary at a
 * glance — which matters here, because seeing "Wrong translation" listed is
 * what tells a user that reporting one is wanted.
 *
 * The chip sends a stable enum key, never its label. A translated label round-
 * tripped through the API would arrive as `Falsche Übersetzung` and match
 * nothing.
 *
 * There is deliberately no email field. Asking for one solicits PII for a
 * channel that has no way to reply anyway, and a form that asks reads as a form
 * that expects — someone who wants a response can put an address in the
 * message, which is their initiative rather than our prompt.
 */

// Four, so the row fits on one line and the space the second line was taking
// goes to the field instead. "Data looks wrong" is the one dropped: it is the
// hardest of the five to tell apart from "Bug" from the outside — a wrong type
// on a Pokémon is honestly both — and anything it would have caught arrives
// under Bug or Other with the same message attached.
//
// `'data'` stays in `FeedbackCategory` and in the API's accepted set. Reports
// already filed under it are in Redis and still have to read back in the admin
// view; narrowing the type would only make old rows unrepresentable.
//
// `NoArgKey` rather than `MessageKey`: a plain `MessageKey` annotation widens
// each entry to the whole key union, including keys that take placeholders, and
// then `t(key)` rightly demands arguments none of these have.
//
// `scale` evens out the four icons: their square box, the area inside their
// outline and their ink come out about the same. The bug is set larger by eye
// than its measured 91%.
type ChipIcon = ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
const CATEGORIES: { id: FeedbackCategory; key: NoArgKey; Icon: ChipIcon; scale: number }[] = [
  { id: 'bug', key: 'feedback.category.bug', Icon: BugIcon, scale: 1.12 },
  { id: 'translation', key: 'feedback.category.translation', Icon: Languages, scale: 1.03 },
  { id: 'idea', key: 'feedback.category.idea', Icon: Lightbulb, scale: 1.1 },
  { id: 'other', key: 'feedback.category.other', Icon: MessageCircle, scale: 0.94 },
];

const MIN_MESSAGE = 4;
const MAX_MESSAGE = 1000;

/** The context, rendered as the plain lines the "what gets sent" panel shows. */
function contextLines(context: FeedbackContext): string[] {
  const lines = [
    `page: ${context.route}`,
    `language: ${context.locale}${context.localeAuto ? ' (auto-detected)' : ''}`,
    `browser languages: ${context.languages.join(', ') || '—'}`,
    `version: ${context.version}`,
    `screen: ${context.viewport} @${context.dpr}x`,
    `browser: ${context.ua}`,
    `Pokémon placed: ${context.placed}`,
    `search active: ${context.search ? 'yes' : 'no'}`,
    `filters active: ${context.filters.join(', ') || 'none'}`,
  ];
  if (context.favorites) {
    const f = context.favorites;
    lines.push(`favorites selected: ${f.filled}/${f.total} (${f.picksFilled} picks, ${f.pointersFilled} summaries)`);
    lines.push(`picker cell: ${f.selection ? `${f.selection.type} · ${f.selection.gen}` : 'none'}`);
  }
  if (context.error) lines.push(`error: ${context.error.name}: ${context.error.message}`);
  if (context.message) lines.push(`string: ${context.message.key}`);
  return lines;
}

function FeedbackForm({
  route,
  toolContext,
  initialCategory,
  error,
  fill,
  onDone,
}: {
  route: string;
  toolContext?: FeedbackToolContext;
  initialCategory: FeedbackCategory;
  error?: FeedbackContext['error'];
  /**
   * Lay the form out to its container's height rather than to its content, so
   * the textarea absorbs whatever is left over. Set by the sheet, where the
   * container height is the space above the keyboard; left off on desktop,
   * where the card is content-sized and there is nothing to absorb.
   */
  fill?: boolean;
  onDone: () => void;
}) {
  const t = useT();
  // Whether the sheet is currently sharing the screen with a keyboard. Drives
  // the compact spacing below — see the comment on the form's className.
  const tight = useSheetKeyboard();
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  // Set on mount rather than during render — the dwell check needs the moment
  // the form appeared, and `Date.now()` is impure so it cannot be read here.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // Collected once, on open: the point is to capture the state the person was
  // looking at when something went wrong, not the state after they navigated to
  // the form.
  const context = useMemo(() => {
    const c = collectFeedbackContext(route, toolContext);
    return error ? { ...c, error } : c;
  }, [route, error, toolContext]);

  // Close a moment after success so the acknowledgement is actually read.
  useEffect(() => {
    if (state !== 'sent') return;
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [state, onDone]);

  if (state === 'sent') {
    return (
      <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
        <Check className="w-6 h-6 text-primary" />
        <p className="text-sm font-medium">{t('feedback.thanks')}</p>
      </div>
    );
  }

  const tooShort = message.trim().length < MIN_MESSAGE;

  return (
    <form
      // pt-3, not 0: the chips carry an outline, and with the form flush to the
      // header above it the two strokes met and read as one broken rule.
      //
      // `h-full` only resolves when the sheet has a definite height, which it
      // takes on exactly when a keyboard is open. Any other time this is a no-op
      // and the form sizes to its content as before.
      //
      // Not `min-h-full`, which looks like the safer version of the same idea
      // and is not the same idea at all. A minimum lets the form grow to its
      // content, so the column never runs out of room, so nothing ever shrinks
      // — the field keeps its four rows and pushes the button off the end,
      // which is the whole bug. Compression is the point, and `h-full` is what
      // asks for it.
      //
      // The padding and the gaps halve while a keyboard is up. Compression
      // alone leaves the field at about two lines on a 15 Pro, because every
      // pixel it gives up is the only pixel anything gives up — and whitespace
      // between five fixed rows is worth less than a message you can read back.
      // Spacing is the first thing to spend and it is spent only while the
      // screen is a third of itself.
      className={`px-4 flex flex-col ${tight ? 'pt-1.5 pb-2 gap-1.5' : 'pt-3 pb-4 gap-3'}${
        fill ? ' h-full' : ''
      }`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (tooShort || state === 'sending') return;
        setState('sending');
        const ok = await sendFeedback({
          category,
          message: message.trim(),
          context,
          website,
          dwellMs: Date.now() - openedAt.current,
        });
        setState(ok ? 'sent' : 'failed');
      }}
    >
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map(({ id, key, Icon, scale }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            aria-pressed={category === id}
            // `px-2` and `min-h-8` rather than `px-2.5`/`min-h-9`: four chips
            // have to clear 390px on one line, and the vertical trim buys the
            // field another 4px. 32px is under Apple's 44px target, but the row
            // is a set of adjacent chips with 6px between them rather than an
            // isolated control, and losing a whole second row to reach 36 costs
            // the field more than it buys the thumb.
            className={`inline-flex items-center gap-1.5 px-2 min-h-8 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
              category === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            <Icon className="w-3.5 h-3.5" {...pathScale(scale)} />
            {t(key)}
          </button>
        ))}
      </div>

      {/* The field is the one element allowed to give. Everything else in this
          column is a fixed size, so when a keyboard takes two thirds of the
          screen the field shrinks and the disclosure and the button keep their
          places instead of being pushed below the fold.

          Label and field are siblings of the chips and the button rather than a
          wrapped pair, and that is load-bearing rather than tidying. Wrapped,
          the field is a flex item of a flex item, and the outer box's automatic
          minimum height is its *content's* minimum — where a textarea
          contributes its `rows` height, not its `min-height`. So the wrapper
          refuses to shrink to the field's real floor and pushes the button off
          the end. Add `min-h-0` to unstick it and it shrinks straight past the
          floor instead, the field spills out of a parent that no longer
          contains it, and it paints over the disclosure and the button. Those
          are the only two settings the wrapper has, and both are wrong.

          Flattened, the field is a flex item carrying an explicit `min-height`,
          which replaces the automatic minimum outright. It compresses to
          exactly its floor and no further, and there is no second box left to
          disagree with it. */}
      <label htmlFor="feedback-message" className="text-xs font-medium">
        {t('feedback.message.label')}
        {(category === 'bug' || category === 'idea') && (
          <span className="ml-1 font-normal text-muted-foreground">
            {t('feedback.message.readEverything')}
          </span>
        )}
      </label>
      <textarea
        id="feedback-message"
        autoFocus
        required
        // `rows` is the height with room to spare, `flex-1` grows it into
        // whatever the column has left over, and `min-h-14` is the floor it
        // compresses to when a keyboard takes that room away — two lines, below
        // which the field stops reading as somewhere to write.
        rows={4}
        maxLength={MAX_MESSAGE}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('feedback.message.placeholder')}
        // `overscroll-contain` is what keeps a drag inside the field from
        // becoming a drag on the page. A textarea is a scroll container, so
        // once its own scroll reaches an end iOS hands the rest of the gesture
        // to the nearest ancestor that can take it — which, with a keyboard up,
        // is the document, and the sheet is positioned against the viewport the
        // document is now moving under. Reading back what you typed pulled the
        // sheet off the bottom of the screen.
        //
        // The negative top margin walks back the gap the form puts between its
        // rows, so the field sits close under the label it belongs to rather
        // than at the column's own rhythm. It has to track that gap rather than
        // be a constant: a fixed `-mt-2` is larger than the compact `gap-1.5`,
        // which pulls the field 2px *over* its label. The audit caught exactly
        // that, which is the shape of every bug on this surface so far — a
        // number that was right beside the number it was paired with, and wrong
        // beside the one that replaced it.
        //
        // `text-base` below `md`, not `text-sm`: iOS Safari zooms the whole
        // page in when a field smaller than 16px takes focus, and the root
        // font size floors at 16px, so `text-sm` lands at 14. The field is
        // also autofocused, so the zoom fires on open rather than on tap.
        // Same rule the shared `Input` component already follows.
        className={`w-full min-h-14 flex-1 overscroll-contain rounded-md border bg-background px-2 py-1.5 text-base md:text-sm resize-y ${
          tight ? '-mt-0.5' : '-mt-2'
        }`}
      />

      {/* Honeypot. Off-screen rather than display:none (which some bots skip),
          hidden from assistive tech, and unreachable by keyboard — so only an
          automated form-filler ever puts anything in it. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute left-[-9999px] w-px h-px opacity-0"
      />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{t('feedback.context.summary')}</summary>
        <ul className="mt-1.5 pl-3 flex flex-col gap-0.5 font-mono text-[0.6875rem] break-all">
          {contextLines(context).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-1.5">{t('feedback.context.note')}</p>
      </details>

      {state === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {t('feedback.failed')}
        </p>
      )}

      <Button type="submit" disabled={tooShort || state === 'sending'} className="w-full">
        {state === 'sending' ? t('feedback.sending') : t('feedback.send')}
      </Button>
    </form>
  );
}

export function FeedbackSheet({
  route,
  toolContext,
  initialCategory = 'bug',
  error,
  anchor = null,
  onClose,
}: {
  route: string;
  toolContext?: FeedbackToolContext;
  initialCategory?: FeedbackCategory;
  error?: FeedbackContext['error'];
  /** The control that opened the form; the desktop card opens beside it. */
  anchor?: FeedbackAnchor;
  onClose: () => void;
}) {
  const t = useT();
  // Picked in JS rather than by rendering both and hiding one with `md:`. The
  // usual CSS approach is fine for a list of buttons, but this is a form:
  // two copies means two sets of half-typed state and two honeypots, and
  // whichever one is display:none still submits.
  const isDesktop = useViewportAtLeast(1024);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Every anchor the app passes today is a desktop-visible control, but the
  // mobile branch renders no card, so gate on the breakpoint too.
  const anchored = isDesktop && anchor !== null;
  const cardRef = useAnchoredCard(anchor, isDesktop);

  const form = (fill?: boolean) => (
    <FeedbackForm
      route={route}
      toolContext={toolContext}
      initialCategory={initialCategory}
      error={error}
      fill={fill}
      onDone={onClose}
    />
  );

  // Mobile: the app's bottom sheet, same as every other mobile surface.
  if (!isDesktop) {
    return (
      <BottomSheet onClose={onClose} title={t('feedback.title')} closeLabel={t('feedback.title')}>
        {form(true)}
      </BottomSheet>
    );
  }

  // Desktop: a card anchored to the control that opened it, rather than a
  // sheet scaled up — the same shape-differs-by-breakpoint treatment the
  // language picker and the analytics drilldowns use.
  //
  // `w-[26rem]`, not the `w-80` this started at: 320px left the chip row 288px
  // to work with, where the mobile sheet gives it 358 and needs about 348 for
  // German. So the one row the mobile layout is built around wrapped to two on
  // the wider screen. 416px clears the widest locale with room to spare and
  // still fits a 1024px window twice over. The cap keeps it inside a narrow
  // desktop window, where wrapping is the right answer.
  return (
    <>
      <div className="fixed inset-0 z-[140]" onClick={onClose} aria-hidden />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={t('feedback.title')}
        className={`fixed z-[150] w-[26rem] max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto overscroll-contain flex flex-col rounded-lg border bg-card shadow-xl${
          anchored ? '' : ' bottom-16 end-3'
        }`}
      >
        <div className="px-4 pt-3 flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{t('feedback.title')}</span>
          {/* Clicking the bug icon again closes the form, and so does Escape or
              a click outside — none of which is visible in the card. A control
              that offers no way out reads as stuck even when it is not. Same
              accessible name as the sheet's own close control on mobile. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('feedback.title')}
            data-feedback-close
            className="-me-1 -mt-0.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {form()}
      </div>
    </>
  );
}
