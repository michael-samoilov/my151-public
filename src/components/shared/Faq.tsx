import { useT, type NoArgKey } from '@/i18n';

/**
 * The "About this tool" block under a page's footer.
 *
 * The questions are the page's h2 headings and the answers are paragraphs,
 * rendered by React and collapsed by default (docs/seo/PAGE-SEO-CONTRACT.md).
 * The copy is docs/seo/LAUNCH-COPY.md, owner-approved, through the catalog
 * like every other visible string. The keys are written out rather than
 * built from the page name, so the extraction catalog can place each one.
 */
export type FaqPage = 'hub' | 'dex' | 'league';

const FAQ: Record<FaqPage, [NoArgKey, NoArgKey][]> = {
  hub: [
    ['faq.hub.q1', 'faq.hub.a1'],
    ['faq.hub.q2', 'faq.hub.a2'],
    ['faq.hub.q3', 'faq.hub.a3'],
  ],
  dex: [
    ['faq.dex.q1', 'faq.dex.a1'],
    ['faq.dex.q2', 'faq.dex.a2'],
    ['faq.dex.q3', 'faq.dex.a3'],
    ['faq.dex.q4', 'faq.dex.a4'],
  ],
  league: [
    ['faq.league.q1', 'faq.league.a1'],
    ['faq.league.q2', 'faq.league.a2'],
    ['faq.league.q3', 'faq.league.a3'],
  ],
};

export function Faq({ page }: { page: FaqPage }) {
  const t = useT();
  return (
    <details data-testid="faq" className="mx-auto w-full max-w-[40rem] px-4 pb-6 text-left">
      <summary className="cursor-pointer py-2 text-center text-[0.6875rem] text-muted-foreground/70 underline underline-offset-2 hover:text-foreground">
        {t('faq.summary')}
      </summary>
      <div className="flex flex-col gap-4 pt-2">
        {FAQ[page].map(([q, a]) => (
          <section key={q}>
            <h2 className="m-0 text-[0.8125rem] font-semibold text-foreground">{t(q)}</h2>
            <p className="m-0 mt-1 text-[0.75rem] leading-relaxed text-muted-foreground">{t(a)}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
