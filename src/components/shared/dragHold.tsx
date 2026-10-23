export const DRAG_SOURCE_OPACITY = 0.25;

export function HeldItems({
  children,
  placement = 'on',
}: {
  children: React.ReactNode;
  placement?: 'on' | 'below' | 'above';
}) {
  const box =
    placement === 'below' ? 'absolute left-1/2 top-full flex'
    : placement === 'above' ? 'absolute left-1/2 bottom-full flex'
    : 'absolute left-1/2 top-1/2 flex';
  const shift =
    placement === 'below' ? 'translate(-50%, 0.5rem)'
    : placement === 'above' ? 'translate(-50%, -0.5rem)'
    : 'translate(-50%, -50%)';
  return (
    <div
      data-drag-held
      data-placement={placement}
      className={box}
      style={{ transform: shift }}
    >
      {children}
    </div>
  );
}
