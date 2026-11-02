import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { FloatingTip } from '@/components/milestone/TipCard';
import { useOverlayOpen } from '@/components/milestone/useOverlayOpen';

const REVEAL_DELAY_MOBILE_MS = 950;
const REVEAL_DELAY_DESKTOP_MS = 640;

export function AnalyticsNudge({ armed, canShow, desktop, onOpen, onDismiss }: {
  armed: boolean;
  canShow: boolean;
  desktop: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [ready, setReady] = useState(false);
  const covered = useOverlayOpen(armed && canShow);
  const show = armed && canShow && !covered;
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => setReady(true), desktop ? REVEAL_DELAY_DESKTOP_MS : REVEAL_DELAY_MOBILE_MS);
    return () => {
      clearTimeout(timer);
      setReady(false);
    };
  }, [show, desktop]);
  if (!show || !ready) return null;
  return (
    <FloatingTip
      id="favorites-25"
      target="favorites-analytics"
      title={t('nudge.25.title')}
      action={t('nudge.25.cta')}
      onAction={onOpen}
      onDismiss={onDismiss}
    />
  );
}
