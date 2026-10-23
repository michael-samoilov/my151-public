let installed = false;

/**
 * Keeps React from crashing on a page that the browser translated.
 *
 * Page translation, such as Chrome's, replaces the text nodes that React
 * rendered with its own `<font>` elements. When React later removes such a
 * text node, or inserts before one, the DOM throws `NotFoundError`. A visitor
 * crashed the Pokédex builder this way 10 times on October 20, 2026. The fix
 * follows https://github.com/facebook/react/issues/11538. A translated page
 * can then keep showing an old piece of text until the next reload.
 */
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
