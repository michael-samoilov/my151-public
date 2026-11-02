import { useTipDot, type TipTarget } from './tipDots';

export function TipDot({ target }: { target: TipTarget }) {
  if (!useTipDot(target)) return null;
  return (
    <span
      data-tip-dot
      aria-hidden
      className="pointer-events-none absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-primary ring-2 ring-card"
    />
  );
}
