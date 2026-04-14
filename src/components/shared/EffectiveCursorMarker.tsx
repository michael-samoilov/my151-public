/**
 * Faint, fixed-position marker shown at the "effective cursor" location
 * during a drag — i.e. where the hit-test actually lives. On desktop
 * that's the raw mouse; on touch it's the thumb lifted by
 * TOUCH_HIT_LIFT_PX so the user can point at a tile without their
 * finger covering it. Pair it with the strong red drop-indicator at the
 * bundle edge: the faded marker shows WHERE you're pointing, the
 * indicator shows WHERE it will land if you release.
 */
export function EffectiveCursorMarker({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="fixed pointer-events-none z-[9999]"
      style={{
        left: x,
        top: y,
        width: 3,
        height: 48,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <div className="w-full h-full rounded-full bg-red-500/40" />
    </div>
  );
}
