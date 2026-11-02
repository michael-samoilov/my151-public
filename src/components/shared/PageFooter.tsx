import { lazy, Suspense, useState } from 'react';
import { useT } from '@/i18n';
import { Faq, type FaqPage } from '@/components/shared/Faq';
import { openFeedback } from '@/components/feedback/feedbackChannel';
import { BUILD_TIMESTAMP } from '@/lib/buildVersion';
import { loadChunk } from '@/lib/staleDeploy';

const AcknowledgementsPanel = lazy(() => loadChunk(() => import('./AcknowledgementsPanel'))
  .then((module) => ({ default: module.AcknowledgementsPanel })));
const BUILD_VERSION = BUILD_TIMESTAMP.replace(/[-:T]/g, '').slice(2, 12);
const YEAR = new Date().getFullYear();

export function PageFooter({ faq, compact = false }: { faq?: FaqPage; compact?: boolean } = {}) {
  const t = useT();
  const [ackFrom, setAckFrom] = useState<HTMLElement | null>(null);
  const ackLink = (className: string) => (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => setAckFrom(e.currentTarget)}
      className={className}
    >
      {t('footer.acknowledgements')}
    </button>
  );
  const ackPanel = ackFrom && (
    <Suspense fallback={null}>
      <AcknowledgementsPanel anchor={ackFrom} onClose={() => setAckFrom(null)} />
    </Suspense>
  );
  if (compact) {
    return (
      <div className="flex flex-col items-center">
        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-[length:max(11px,0.5625rem)] text-muted-foreground">
          <span>
            v{BUILD_VERSION} · Pokémon © 1995–{YEAR}{' '}
            <span className="whitespace-nowrap">Nintendo / Game Freak / Creatures / TPC</span>
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={(e) => openFeedback('bug', e.currentTarget)}
            className="cursor-pointer underline underline-offset-2 hover:text-foreground"
          >
            {t('footer.report')}
          </button>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          {ackLink('cursor-pointer underline underline-offset-2 hover:text-foreground')}
        </footer>
        {faq && <Faq page={faq} compact />}
        {ackPanel}
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-1">
      <div className="w-[85%] border-t" />
      {/* platform: Only a footer element outside main is a footer landmark that a screen reader can jump to. */}
      <footer className="py-3 flex flex-col items-center gap-1">
      <svg width="24" height="24" viewBox="0 0 24 24" className="text-muted-foreground/40">
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="1" y1="12" x2="8.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <line x1="15.5" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
      <span className="text-[length:max(11px,0.5625rem)] text-muted-foreground text-center">
        v{BUILD_VERSION} · Pokémon © 1995–{YEAR}{' '}
        <span className="whitespace-nowrap">Nintendo / Game Freak / Creatures / TPC</span>
      </span>
      <span className="text-[length:max(11px,0.5rem)] text-muted-foreground">
        {t('footer.disclaimer')}
      </span>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[length:max(11px,0.5625rem)] text-muted-foreground">
        <button
          type="button"
          onClick={(e) => openFeedback('bug', e.currentTarget)}
          className="underline underline-offset-2 hover:text-foreground cursor-pointer"
        >
          {t('footer.report')}
        </button>
        <span aria-hidden className="text-muted-foreground/40">·</span>
        {ackLink('underline underline-offset-2 hover:text-foreground cursor-pointer')}
      </div>
      </footer>
      {faq && <Faq page={faq} />}
      {ackPanel}
    </div>
  );
}
