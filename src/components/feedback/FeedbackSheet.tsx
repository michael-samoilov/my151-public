import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { Check, Languages, Lightbulb, MessageCircle, X } from 'lucide-react';
import { BugIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSheetKeyboard } from '@/components/ui/sheetKeyboard';
import { Button } from '@/components/ui/button';
import { useT, useTn } from '@/i18n';
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
import type { NoArgKey, TFn, TnFn } from '@/i18n';
import { FEEDBACK_FIELD_MAX_CHARS, FEEDBACK_MIN_CHARS } from '@/lib/feedbackLimits';
import { CharsLeft } from './CharsLeft';

type ChipIcon = ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
const CATEGORIES: { id: FeedbackCategory; key: NoArgKey; Icon: ChipIcon; scale: number }[] = [
  { id: 'bug', key: 'feedback.category.bug', Icon: BugIcon, scale: 1.12 },
  { id: 'translation', key: 'feedback.category.translation', Icon: Languages, scale: 1.03 },
  { id: 'idea', key: 'feedback.category.idea', Icon: Lightbulb, scale: 1.1 },
  { id: 'other', key: 'feedback.category.other', Icon: MessageCircle, scale: 0.94 },
];


function contextLines(context: FeedbackContext, t: TFn, tn: TnFn): string[] {
  const lines = [
    t('feedback.context.page', { route: context.route }),
    context.localeAuto
      ? t('feedback.context.languageAuto', { locale: context.locale })
      : t('feedback.context.language', { locale: context.locale }),
    t('feedback.context.browserLanguages', { languages: context.languages.join(', ') || '—' }),
    t('feedback.context.version', { version: context.version }),
    t('feedback.context.screen', { viewport: context.viewport, dpr: context.dpr }),
    t('feedback.context.browser', { ua: context.ua }),
    t('feedback.context.placed', { count: context.placed }),
    t(context.search ? 'feedback.context.searchOn' : 'feedback.context.searchOff'),
    context.filters.length
      ? t('feedback.context.filters', { filters: context.filters.join(', ') })
      : t('feedback.context.filtersNone'),
  ];
  if (context.favorites) {
    const f = context.favorites;
    lines.push(
      t('feedback.context.favorites', {
        filled: f.filled,
        total: f.total,
        picks: tn('feedback.context.favoritePicks', f.picksFilled),
        summaries: tn('feedback.context.favoriteSummaries', f.pointersFilled),
      }),
    );
    lines.push(
      f.selection
        ? t('feedback.context.pickerCell', { type: f.selection.type, gen: f.selection.gen })
        : t('feedback.context.pickerCellNone'),
    );
  }
  if (context.message) lines.push(t('feedback.context.string', { key: context.message.key }));
  return lines;
}

function FeedbackForm({
  route,
  toolContext,
  initialCategory,
  fill,
  onDone,
}: {
  route: string;
  toolContext?: FeedbackToolContext;
  initialCategory: FeedbackCategory;
  fill?: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const tn = useTn();
  const tight = useSheetKeyboard();
  const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const context = useMemo(() => collectFeedbackContext(route, toolContext), [route, toolContext]);

  useEffect(() => {
    if (state !== 'sent') return;
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [state, onDone]);

  // Both returns render this node first, so React keeps it when the thanks
  // replaces the form. Screen readers announce text added to a status region
  // they already track more reliably than a region inserted with its text.
  const sent = state === 'sent';
  const status = (
    <div role="status" className={sent ? 'px-4 py-8 flex flex-col items-center gap-2 text-center' : undefined}>
      {sent && (
        <>
          <Check className="w-6 h-6 text-primary" />
          <p className="text-sm font-medium">{t('feedback.thanks')}</p>
        </>
      )}
    </div>
  );
  if (sent) return status;

  const tooShort = message.trim().length < FEEDBACK_MIN_CHARS;

  return (
    <>
      {status}
      <form
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
          rows={4}
          maxLength={FEEDBACK_FIELD_MAX_CHARS}
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
        <CharsLeft length={message.length} max={FEEDBACK_FIELD_MAX_CHARS} />

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
          <ul className="mt-1.5 pl-3 flex flex-col gap-0.5 font-mono text-[0.6875rem] wrap-anywhere">
            {contextLines(context, t, tn).map((line) => (
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
    </>
  );
}

export function FeedbackSheet({
  route,
  toolContext,
  initialCategory = 'bug',
  anchor = null,
  onClose,
}: {
  route: string;
  toolContext?: FeedbackToolContext;
  initialCategory?: FeedbackCategory;
  anchor?: FeedbackAnchor;
  onClose: () => void;
}) {
  const t = useT();
  const isDesktop = useViewportAtLeast(1024);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const anchored = isDesktop && anchor !== null;
  const cardRef = useAnchoredCard(anchor, isDesktop);

  const form = (fill?: boolean) => (
    <FeedbackForm
      route={route}
      toolContext={toolContext}
      initialCategory={initialCategory}
      fill={fill}
      onDone={onClose}
    />
  );

  if (!isDesktop) {
    return (
      <BottomSheet onClose={onClose} title={t('feedback.title')} closeLabel={t('browser.close')} dialogLabel={t('feedback.title')}>
        {form(true)}
      </BottomSheet>
    );
  }

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
          <button
            type="button"
            onClick={onClose}
            aria-label={t('browser.close')}
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
