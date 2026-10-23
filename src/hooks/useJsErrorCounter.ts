import { useEffect } from 'react';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';

export function useJsErrorCounter(): void {
  useEffect(() => {
    const onError = () => sendEventBeacon('js-error', { once: true });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);
}
