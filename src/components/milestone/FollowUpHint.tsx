import { useEffect, useState } from 'react';
import { TipCard } from './TipCard';
import type { TipTarget } from './tipDots';

const REVEAL_DELAY_MS = 260;

/** A body-only tip that a finished step arms, and that opening its target fulfills. */
export function FollowUpHint({
  id,
  armed,
  dismiss,
  fulfilled,
  target,
  title,
  body,
  onShown,
}: {
  id: string;
  armed: boolean;
  dismiss: () => void;
  fulfilled: boolean;
  target: TipTarget;
  title: string;
  body: string;
  onShown?: () => void;
}) {
  useEffect(() => {
    if (fulfilled) dismiss();
  }, [fulfilled, dismiss]);

  const [armedReady, setArmedReady] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmedReady(true), REVEAL_DELAY_MS);
    return () => {
      clearTimeout(t);
      setArmedReady(false);
    };
  }, [armed]);

  const visible = armed && armedReady && !fulfilled;
  useEffect(() => {
    if (visible) onShown?.();
  }, [visible, onShown]);

  if (!visible) return null;
  return <TipCard id={id} target={target} title={title} body={body} onDismiss={dismiss} />;
}
