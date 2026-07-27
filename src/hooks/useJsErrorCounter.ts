import { useEffect } from 'react';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';

/**
 * Counts uncaught errors. Only counts them.
 *
 * No message, no stack, no URL — those can carry a user's own data, and this is
 * not a crash reporter. What it answers is the one question the app currently
 * cannot: did the error rate move the day a locale shipped? A person who wants
 * to say what actually broke has the report form, where they can see what they
 * are sending first.
 *
 * Deliberately not Sentry: another vendor, another consent surface, and a
 * quota, for a signal this shape can give for free.
 */
export function useJsErrorCounter(): void {
  useEffect(() => {
    // `once` per browser, matching every other funnel event: this measures how
    // many people hit an error, not how many times a stuck render loop fires.
    const onError = () => sendEventBeacon('js-error', { once: true });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);
}
