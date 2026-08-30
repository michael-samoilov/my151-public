/**
 * One "you are holding this" treatment, for every drag in the app.
 *
 * The dex builder, the view page, the league summary and the gym card each
 * grew their own: a faded source here, a scaled-and-ringed target there, a
 * shadowed copy somewhere else. Four treatments for one idea reads as four
 * half-finished features, so the idea lives here and every surface imports
 * it rather than restating it.
 *
 * The pattern, in two parts:
 *
 *  1. **The source recedes.** Whatever was picked up drops to
 *     `DRAG_SOURCE_OPACITY` where it sits, so the layout keeps its shape and
 *     the eye stops reading that copy as the live one.
 *  2. **A copy is held.** `HeldItems` centres a static copy of what was
 *     grabbed on the pointer, inside dnd-kit's `<DragOverlay>`. It is the
 *     only thing at full strength during a drag, which is what makes it read
 *     as held rather than as moved.
 *
 * What is *not* part of the pattern is how the destination is shown — an
 * insert bar in the dex builder, a re-derived preview in the league. Those
 * answer different questions and are meant to differ.
 */

/** How far the picked-up thing recedes in place. */
export const DRAG_SOURCE_OPACITY = 0.25;

/**
 * The held copy, centred on the pointer.
 *
 * Goes inside `<DragOverlay dropAnimation={null}>`. Children render at their
 * natural size and carry their own `shadow-lg`, which is what lifts them off
 * the surface behind.
 */
export function HeldItems({ children }: { children: React.ReactNode }) {
  return (
    <div
      // The one handle every surface's held copy answers to, so "is something
      // being carried, and only one thing" is a question a test can ask.
      data-drag-held
      className="absolute left-1/2 top-1/2 flex"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      {children}
    </div>
  );
}
