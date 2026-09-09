/**
 * How the app says "you are holding this".
 *
 * One rule decides the geometry: **nothing the drop is about sits below the
 * thumb.** A finger hides whatever is under it, so the target reads above the
 * finger and so does the copy.
 *
 * **Between** (dex builder, view page): you are choosing a *gap* — which two
 * evolution lines to land between. The copy cannot be the preview, because a
 * gap has no contents, so an insert bar marks the gap and the copy rides
 * between the finger and the bar. A 3px bar is not something a tile hides.
 *
 * **Into** (league summary, gym card): you are choosing a *slot*, and the copy
 * can simply BE the preview — it sits on the target
 * (`snapOverlayToTarget`, in `src/lib/dragCollision.ts`), and the slot underneath opens empty rather than
 * drawing the same thing twice. Only the legendary keeps an offset copy,
 * because there the target is a cell that must stay readable underneath.
 *
 * What every surface shares: exactly one copy at full strength, and a source
 * that either recedes to `DRAG_SOURCE_OPACITY` or opens as an empty slot.
 */

/** How far the picked-up thing recedes in place. */
export const DRAG_SOURCE_OPACITY = 0.25;

/**
 * The held copy. Goes inside `<DragOverlay dropAnimation={null}>`.
 *
 * `placement="on"` centres it on the grab point; `placement="above"` lifts it
 * clear, which is the only safe side on touch. `placement="below"` is kept
 * for the desktop-only surfaces that want it. Children render at their
 * natural size and carry their own `shadow-lg`.
 */
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
      // The one handle every surface's held copy answers to, so "is something
      // being carried, and only one thing" is a question a test can ask.
      data-drag-held
      data-placement={placement}
      className={box}
      style={{ transform: shift }}
    >
      {children}
    </div>
  );
}
