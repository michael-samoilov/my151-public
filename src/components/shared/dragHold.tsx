/**
 * How the app says "you are holding this".
 *
 * Two treatments, because the two kinds of drag answer different questions.
 *
 * **Between** (dex builder, view page): you are choosing a *gap* — which two
 * evolution lines to land between. The copy rides on the pointer and an
 * insert bar marks the gap, because the gap is a place the pointer can be.
 *
 * **Into** (league summary, gym card): you are choosing a *slot*, and the
 * page redraws to show what that slot would look like holding it. The thing
 * you need to see is under your thumb, so the copy hangs below the grab
 * point instead of sitting on it.
 *
 * What both share, and what makes a drag legible either way: the source
 * recedes to `DRAG_SOURCE_OPACITY` where it sits, and exactly one copy is at
 * full strength.
 */

/** How far the picked-up thing recedes in place. */
export const DRAG_SOURCE_OPACITY = 0.25;

/**
 * The held copy. Goes inside `<DragOverlay dropAnimation={null}>`.
 *
 * `placement="on"` centres it on the grab point; `placement="below"` hangs it
 * under, clear of the thumb. Children render at their natural size and carry
 * their own `shadow-lg`.
 */
export function HeldItems({
  children,
  placement = 'on',
}: {
  children: React.ReactNode;
  placement?: 'on' | 'below';
}) {
  return (
    <div
      // The one handle every surface's held copy answers to, so "is something
      // being carried, and only one thing" is a question a test can ask.
      data-drag-held
      data-placement={placement}
      className={placement === 'below' ? 'absolute left-1/2 top-full flex' : 'absolute left-1/2 top-1/2 flex'}
      style={{ transform: placement === 'below' ? 'translate(-50%, 0.5rem)' : 'translate(-50%, -50%)' }}
    >
      {children}
    </div>
  );
}
