import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { NudgeCard } from '@/components/milestone/NudgeCard';

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
  const show = armed && canShow;
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
    <NudgeCard
      anchor="#favorites-tab-analytics"
      title={t('nudge.25.title')}
      body={t('favorites.nudge.25.body')}
      cta={t('nudge.25.cta')}
      onCta={onOpen}
      onDismiss={onDismiss}
    />
  );
}
