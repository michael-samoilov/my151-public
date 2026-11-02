let installed = false;

// platform: Page translation replaces React's text nodes with <font> elements, so React's removeChild and insertBefore throw NotFoundError (facebook/react#11538).
export function installTranslationGuard(): void {
  if (installed || typeof Node === 'undefined') return;
  installed = true;
  const removeChild = Node.prototype.removeChild;
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call<Node, [T], T>(this, child);
  };
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    const ref = child?.parentNode === this ? child : null;
    return insertBefore.call<Node, [T, Node | null], T>(this, node, ref);
  };
}
