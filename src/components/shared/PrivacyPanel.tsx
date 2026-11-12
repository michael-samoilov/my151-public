import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLocale, useT, type NoArgKey } from '@/i18n';
import { isOptedOut, sendsGlobalPrivacyControl, setOptedOut } from '@/lib/clientId';
import { cn } from '@/lib/utils';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { FooterPanel, PANEL_HEADING } from './FooterPanel';
import { closePrivacyPanel, privacyPanelState, subscribePrivacyPanel } from './privacyPanelStore';

const UPDATED = Date.UTC(2026, 10, 12);

const KEPT = [
  ['privacy.keep.id.label', 'privacy.keep.id'],
  ['privacy.keep.place.label', 'privacy.keep.place'],
  ['privacy.keep.device.label', 'privacy.keep.device'],
  ['privacy.keep.referrer.label', 'privacy.keep.referrer'],
  ['privacy.keep.use.label', 'privacy.keep.use'],
  ['privacy.keep.builds.label', 'privacy.keep.builds'],
  ['privacy.keep.reports.label', 'privacy.keep.reports'],
  ['privacy.keep.visits.label', 'privacy.keep.visits'],
] as const satisfies readonly (readonly [NoArgKey, NoArgKey])[];
const NOT_KEPT = ['privacy.not.contact', 'privacy.not.city', 'privacy.not.ip'] as const satisfies readonly NoArgKey[];
const RETENTION = [
  'privacy.retention.records',
  'privacy.retention.log',
  'privacy.retention.reports',
  'privacy.retention.counters',
  'privacy.retention.totals',
] as const satisfies readonly NoArgKey[];
const PROCESSORS = ['privacy.who.vercel', 'privacy.who.analytics', 'privacy.who.speed', 'privacy.who.upstash'] as const satisfies readonly NoArgKey[];
const LINKS = [
  { href: 'https://vercel.com/legal/privacy-policy', label: 'privacy.link.vercel' },
  { href: 'https://vercel.com/docs/analytics/privacy-policy', label: 'privacy.link.analytics' },
] as const satisfies readonly { href: string; label: NoArgKey }[];

function subscribeOptOut(onChange: () => void): () => void {
  window.addEventListener('p151-opt-out', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('p151-opt-out', onChange);
    window.removeEventListener('storage', onChange);
  };
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pt-5">
      <h3 className={cn(PANEL_HEADING, 'px-5 pb-1.5')}>{label}</h3>
      <ul className="mx-4 divide-y overflow-hidden rounded-lg border bg-card">{children}</ul>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <li className="px-3 py-2.5 text-sm leading-relaxed">{children}</li>;
}

function OptOutSwitch() {
  const t = useT();
  const optedOut = useSyncExternalStore(subscribeOptOut, isOptedOut, () => false);
  const byBrowser = sendsGlobalPrivacyControl();
  return (
    <div className="mx-4 mt-5 flex flex-col gap-2 rounded-lg border bg-card p-3" data-testid="privacy-opt-out">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{t('privacy.switch')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={optedOut}
          disabled={byBrowser}
          onClick={() => setOptedOut(!optedOut)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-60',
            optedOut ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'block h-5 w-5 rounded-full bg-background shadow transition-transform motion-reduce:transition-none',
              optedOut ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </label>
      <p className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
        {t(optedOut ? 'privacy.switchOn' : 'privacy.switchOff')}
      </p>
      <p className="text-xs text-muted-foreground">{t(byBrowser ? 'privacy.gpc' : 'privacy.switchNote')}</p>
    </div>
  );
}

function PrivacyBody({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(UPDATED);
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="h-full overflow-y-auto overscroll-contain pb-6 outline-none"
      data-testid="privacy-body"
    >
      <p className="px-4 pt-3 text-sm leading-relaxed text-muted-foreground">{t('privacy.intro')}</p>
      <p className="px-4 pt-3 text-xs text-muted-foreground">{t('privacy.updated', { date: updated })}</p>
      <OptOutSwitch />
      <Section label={t('privacy.not.title')}>
        {NOT_KEPT.map((key) => <Row key={key}>{t(key)}</Row>)}
      </Section>
      <Section label={t('privacy.keep.title')}>
        {KEPT.map(([label, text]) => (
          <Row key={text}>
            <span className="block font-medium text-foreground">{t(label)}</span>
            <span className="block text-muted-foreground">{t(text)}</span>
          </Row>
        ))}
      </Section>
      <Section label={t('privacy.retention.title')}>
        {RETENTION.map((key) => <Row key={key}>{t(key)}</Row>)}
      </Section>
      <Section label={t('privacy.who.title')}>
        {PROCESSORS.map((key) => <Row key={key}>{t(key)}</Row>)}
      </Section>
      <div className="mx-4 mt-3 flex flex-wrap gap-2">
        {LINKS.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 break-words">{t(label)}</span>
          </a>
        ))}
      </div>
      <section className="pt-5">
        <h3 className={cn(PANEL_HEADING, 'px-5 pb-1.5')}>{t('privacy.questions.title')}</h3>
        <div className="mx-4 flex flex-col items-start gap-2 rounded-lg border bg-card p-3">
          <p className="text-sm leading-relaxed">{t('privacy.questions')}</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              openFeedback('other', anchor);
            }}
            className="cursor-pointer rounded-md border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('footer.report')}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PrivacyPanelHost() {
  const t = useT();
  const state = useSyncExternalStore(subscribePrivacyPanel, privacyPanelState, () => null);
  if (!state) return null;
  return (
    <FooterPanel title={t('privacy.title')} anchor={state.anchor} onClose={closePrivacyPanel}>
      <PrivacyBody anchor={state.anchor} onClose={closePrivacyPanel} />
    </FooterPanel>
  );
}
