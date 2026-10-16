export function pressedOutside(root: Node | null, target: EventTarget | null): boolean {
  if (!root || !(target instanceof Node)) return false;
  if (root.contains(target)) return false;
  return !(target instanceof Element && target.closest('[data-overlay]'));
}
