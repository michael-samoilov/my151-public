import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n';
import { PsyduckArt } from '@/components/shared/EmptyState';
import { sendCrashReport } from '@/lib/feedbackContext';

/**
 * The app had no error reporting at all: no boundary, no `window.onerror`, and
 * client fetch failures swallowed. A crash produced a white screen and zero
 * signal — the user could not tell you what happened and you could not see that
 * it had. Now each crash a boundary catches sends a report by itself, and the
 * screen offers one thing to do: reload.
 *
 * Still a class, because React 19 has no hook equivalent for
 * `componentDidCatch`.
 *
 * Wrap each `<Suspense>` separately as well as the app: the locale and route
 * chunks are fetched lazily, chunk-load failure on a flaky mobile connection is
 * the most likely error here, and one failed chunk should cost one page rather
 * than the whole session's work.
 */

const ROUTE: Record<string, string> = {
  hub: 'home',
  'pokedex-builder': 'builder',
  view: 'view',
  analytics: 'analytics',
  league: 'league',
  'league-desktop': 'league',
  'league-export': 'league',
  'favorite-picker': '/favorite-pokemon-picker',
};

interface Props {
  children: ReactNode;
  where: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const { where } = this.props;
    sendCrashReport(ROUTE[where] ?? where, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      where,
    });
    console.error(`[P151] crash in ${this.props.where}:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <PsyduckArt className="mb-4 size-24 shrink-0 text-[#a3a3a3]" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground text-balance">{t('error.title')}</h2>
        <p className="mt-1 max-w-[17.5rem] text-xs leading-[1.125rem] text-muted-foreground text-balance">{t('error.body')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-3 h-9 rounded-md border text-sm cursor-pointer hover:bg-muted"
        >
          {t('error.reload')}
        </button>
      </div>
    );
  }
}
