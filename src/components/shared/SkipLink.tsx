import { useT } from '@/i18n';

export const MAIN_ID = 'main-content';

export function SkipLink() {
  const t = useT();
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
      className="sr-only focus:not-sr-only focus:flex focus:h-9 focus:w-full focus:shrink-0 focus:items-center focus:border-b focus:bg-card focus:px-3 focus:text-sm focus:font-semibold focus:whitespace-nowrap focus:text-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring sm:focus:px-6"
    >
      {t('common.skipToMain')}
    </a>
  );
}
