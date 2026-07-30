import { useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Check, Languages, Lightbulb, MessageCircle, Table2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import {
  collectFeedbackContext,
  sendFeedback,
  type FeedbackCategory,
  type FeedbackContext,
} from '@/lib/feedbackContext';
import type { NoArgKey } from '@/i18n';

/**
 * The report form.
 *
 * Categories are chips, not a `<select>`: five options is below the width where
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

// `NoArgKey` rather than `MessageKey`: a plain `MessageKey` annotation widens
// each entry to the whole key union, including keys that take placeholders, and
// then `t(key)` rightly demands arguments none of these have.
const CATEGORIES: { id: FeedbackCategory; key: NoArgKey; Icon: typeof Bug }[] = [
  { id: 'bug', key: 'feedback.category.bug', Icon: Bug },
  { id: 'translation', key: 'feedback.category.translation', Icon: Languages },
  { id: 'idea', key: 'feedback.category.idea', Icon: Lightbulb },
  { id: 'data', key: 'feedback.category.data', Icon: Table2 },
  { id: 'other', key: 'feedback.category.other', Icon: MessageCircle },
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
  if (context.error) lines.push(`error: ${context.error.name}: ${context.error.message}`);
  if (context.message) lines.push(`string: ${context.message.key}`);
  return lines;
}

function FeedbackForm({
  route,
  initialCategory,
  error,
  onDone,
}: {
  route: string;
  initialCategory: FeedbackCategory;
  error?: FeedbackContext['error'];
  onDone: () => void;
}) {
  const t = useT();
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
    const c = collectFeedbackContext(route);
    return error ? { ...c, error } : c;
  }, [route, error]);

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
      className="px-4 pt-3 pb-4 flex flex-col gap-3"
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
        {CATEGORIES.map(({ id, key, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            aria-pressed={category === id}
            className={`inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
              category === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(key)}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t('feedback.message.label')}</span>
        <textarea
          autoFocus
          required
          rows={4}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('feedback.message.placeholder')}
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm resize-y"
        />
      </label>

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
  initialCategory = 'bug',
  error,
  onClose,
}: {
  route: string;
  initialCategory?: FeedbackCategory;
  error?: FeedbackContext['error'];
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

  const form = (
    <FeedbackForm route={route} initialCategory={initialCategory} error={error} onDone={onClose} />
  );

  // Mobile: the app's bottom sheet, same as every other mobile surface.
  if (!isDesktop) {
    return (
      <BottomSheet onClose={onClose} title={t('feedback.title')} closeLabel={t('feedback.title')}>
        {form}
      </BottomSheet>
    );
  }

  // Desktop: a card anchored over the button that opened it, rather than a
  // sheet scaled up — the same shape-differs-by-breakpoint treatment the
  // language picker and the analytics drilldowns use.
  return (
    <>
      <div className="fixed inset-0 z-[140]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={t('feedback.title')}
        className="fixed bottom-16 end-3 z-[150] w-80 max-h-[80vh] overflow-y-auto flex flex-col rounded-lg border bg-card shadow-xl"
      >
        <div className="px-4 pt-3 text-sm font-semibold">{t('feedback.title')}</div>
        {form}
      </div>
    </>
  );
}
