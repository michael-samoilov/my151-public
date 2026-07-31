import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '@/i18n';
import { openFeedback, setPendingCrash } from '@/components/feedback/feedbackChannel';

/**
 * The app had no error reporting at all: no boundary, no `window.onerror`, and
 * client fetch failures swallowed. A crash produced a white screen and zero
 * signal — the user could not tell you what happened and you could not see that
 * it had.
 *
 * Still a class, because React 19 has no hook equivalent for
 * `componentDidCatch`.
 *
 * Wrap each `<Suspense>` separately as well as the app: the locale and route
 * chunks are fetched lazily, chunk-load failure on a flaky mobile connection is
 * the most likely error here, and one failed chunk should cost one page rather
 * than the whole session's work.
 */

interface Props {
  children: ReactNode;
  /** Named in the report so a crash can be traced to the boundary that caught it. */
  where: string;
}

interface State {
  error: Error | null;
  componentStack?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? undefined });
    // Logged as well as shown: the console is where this is visible during
    // development, and swallowing it here would be a regression on today's
    // behaviour of letting it reach the console uncaught.
    console.error(`[P151] crash in ${this.props.where}:`, error, info.componentStack);
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">{t('error.title')}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{t('error.body')}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 h-9 rounded-md border text-sm cursor-pointer hover:bg-muted"
          >
            {t('error.reload')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingCrash({
                name: error.name,
                message: error.message,
                stack: error.stack,
                componentStack,
              });
              openFeedback('bug');
            }}
            className="px-3 h-9 rounded-md border text-sm cursor-pointer hover:bg-muted"
          >
            {t('error.report')}
          </button>
        </div>
      </div>
    );
  }
}
