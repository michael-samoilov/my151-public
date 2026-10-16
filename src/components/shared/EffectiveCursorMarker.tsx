export function EffectiveCursorMarker({
  x,
  y,
  height = 48,
}: {
  x: number;
  y: number;
  height?: number;
}) {
  return (
    <div
      className="fixed pointer-events-none z-[9999]"
      style={{
        left: x,
        top: y,
        width: 3,
        height,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <div className="w-full h-full rounded-full bg-red-500/40" />
    </div>
  );
}
