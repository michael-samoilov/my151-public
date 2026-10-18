import { useT } from '@/i18n';

export const MAIN_ID = 'main-content';

// The click moves focus itself, so the URL keeps no `#main-content`. Before
// React attaches the handler (the hub's prerendered markup), the plain link
// does the same job.
export function SkipLink() {
  const t = useT();
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-1.5 focus:z-[500] focus:inline-flex focus:h-8 focus:items-center focus:rounded-md focus:border focus:bg-card focus:px-3 focus:text-sm focus:font-semibold focus:whitespace-nowrap focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:focus:left-6"
    >
      {t('common.skipToMain')}
    </a>
  );
}
