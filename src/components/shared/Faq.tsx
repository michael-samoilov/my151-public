import { useT, type NoArgKey } from '@/i18n';

/**
 * The "About this tool" block under a page's footer.
 *
 * The questions are the page's h2 headings and the answers are paragraphs,
 * rendered by React and collapsed by default (docs/seo/PAGE-SEO-CONTRACT.md).
 * The copy is docs/seo/LAUNCH-COPY.md, owner-approved, through the catalog
 * like every other visible string.
 */
export type FaqPage = 'hub' | 'dex' | 'league';

const QUESTIONS: Record<FaqPage, number> = { hub: 3, dex: 4, league: 3 };

export function Faq({ page }: { page: FaqPage }) {
  const t = useT();
  const items = Array.from({ length: QUESTIONS[page] }, (_, i) => ({
    q: `faq.${page}.q${i + 1}` as NoArgKey,
    a: `faq.${page}.a${i + 1}` as NoArgKey,
  }));
  return (
    <details data-testid="faq" className="mx-auto w-full max-w-[40rem] px-4 pb-6 text-left">
      <summary className="cursor-pointer py-2 text-center text-[0.6875rem] text-muted-foreground/70 underline underline-offset-2 hover:text-foreground">
        {t('faq.summary')}
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        {items.map(({ q, a }) => (
          <section key={q}>
            <h2 className="m-0 text-[0.8125rem] font-semibold text-foreground">{t(q)}</h2>
            <p className="m-0 mt-1 text-[0.75rem] leading-relaxed text-muted-foreground">{t(a)}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
