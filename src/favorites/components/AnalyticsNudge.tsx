import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { NudgeCard } from '@/components/milestone/NudgeCard';

// The Dex builder's reveal delays: the popup floats in once the counter has
// settled, and on a phone once the picker sheet has closed.
const REVEAL_DELAY_MOBILE_MS = 950;
const REVEAL_DELAY_DESKTOP_MS = 640;

/** The Dex builder's 25 popup, under the picker's Analytics tab. */
export function AnalyticsNudge({ armed, canShow, desktop, onOpen, onDismiss }: {
  armed: boolean;
  /** False while the phone's picker sheet is open. */
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
