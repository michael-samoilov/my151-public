/**
 * Whether a press landed outside a menu, counting anything the menu opened.
 *
 * A menu that closes on a press elsewhere usually asks whether the event's
 * target sits inside its own root. That question stops matching the user's
 * one as soon as the menu opens something portalled: `BottomSheet` renders
 * itself into `document.body`, so a press on a chip inside the sheet is
 * outside the menu's root by every DOM measure — and the menu closed itself
 * before the chip's own handler could run.
 *
 * Overlays mark themselves with `data-overlay`, so a press inside one belongs
 * to whatever opened it. Overlays close themselves, by their backdrop and by
 * Escape, so nothing is lost by not closing them here.
 */
export function pressedOutside(root: Node | null, target: EventTarget | null): boolean {
  if (!root || !(target instanceof Node)) return false;
  if (root.contains(target)) return false;
  return !(target instanceof Element && target.closest('[data-overlay]'));
}
