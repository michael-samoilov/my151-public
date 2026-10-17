import { useT } from '@/i18n';
import { FAQ_KEYS, type FaqPage } from './faqKeys';

export type { FaqPage };

export function Faq({ page, compact = false }: { page: FaqPage; compact?: boolean }) {
  const t = useT();
  return (
    <details data-testid="faq" className={`mx-auto w-full max-w-[40rem] px-4 text-left ${compact ? 'pb-2' : 'pb-6'}`}>
      <summary className={`cursor-pointer text-center text-[0.6875rem] text-muted-foreground underline underline-offset-2 hover:text-foreground ${compact ? 'py-1' : 'py-2'}`}>
        {t('faq.summary')}
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        {FAQ_KEYS[page].map(([q, a]) => (
          <section key={q}>
            <h2 className="m-0 text-[0.8125rem] font-semibold text-foreground">{t(q)}</h2>
            <p className="m-0 mt-1 text-[0.75rem] leading-relaxed text-muted-foreground">{t(a)}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
