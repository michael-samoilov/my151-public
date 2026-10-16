import type { Page } from '@playwright/test';

interface LayoutProblem {
  kind: 'overlap' | 'escapes-parent';
  detail: string;
}

/**
 * Run the audit over the subtree at `selector`.
 *
 * Passed to `page.evaluate`, so it is deliberately one self-contained function
 * with no imports and no closure — Playwright serializes the source and any
 * outer reference would be `undefined` in the browser.
 */
export async function auditLayout(page: Page, selector: string): Promise<LayoutProblem[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel);
    if (!root) throw new Error(`layout audit: nothing matched ${sel}`);

    const problems: { kind: 'overlap' | 'escapes-parent'; detail: string }[] = [];

    const name = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      const type = el.getAttribute('type');
      const id = type ? `${tag}[${type}]` : tag;
      return text ? `${id} "${text}"` : id;
    };

    const inFlow = (el: Element): boolean => {
      // Inside an `<svg>` there is no CSS box model. Two `<path>`s in a lucide
      // icon share a 4x4px corner because that is what the drawing is, and
      // reading that as a layout fault is reading the wrong coordinate system.
      if (el.closest('svg')) return false;

      // A closed `<details>` still lays its content out — Chrome hides it with
      // `content-visibility`, so it keeps a full-size rect while painting
      // nothing. Measuring it reports the panel hanging hundreds of px out of a
      // parent the user sees as one line high.
      const details = el.closest('details');
      if (details && !details.open && !el.closest('summary')) return false;
      if (!el.checkVisibility()) return false;

      const s = getComputedStyle(el);
      if (s.position === 'absolute' || s.position === 'fixed') return false;
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };

    /**
     * The part of an element that is actually on screen.
     *
     * `getBoundingClientRect` reports where a box would be, not where it can be
     * seen. Inside a scroller that has been scrolled, a form's rect runs right
     * off the top of its container while the container clips it — so the raw
     * rects say the form covers the sheet header, and the eye says it plainly
     * does not. Intersecting with every clipping ancestor is what turns a
     * layout coordinate into a visible one.
     */
    const visibleRect = (el: Element): DOMRect | null => {
      let r: { top: number; left: number; right: number; bottom: number } = el.getBoundingClientRect();
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        r = {
          top: Math.max(r.top, pr.top),
          left: Math.max(r.left, pr.left),
          right: Math.min(r.right, pr.right),
          bottom: Math.min(r.bottom, pr.bottom),
        };
        if (r.right <= r.left || r.bottom <= r.top) return null;
      }
      return new DOMRect(r.left, r.top, r.right - r.left, r.bottom - r.top);
    };

    const boxes: Element[] = [];
    const collect = (el: Element) => {
      for (const kid of Array.from(el.children)) {
        if (!inFlow(kid)) continue;
        boxes.push(kid);
        collect(kid);
      }
    };
    collect(root);

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].contains(boxes[j]) || boxes[j].contains(boxes[i])) continue;
        const a = visibleRect(boxes[i]);
        const b = visibleRect(boxes[j]);
        if (!a || !b) continue;
        const overX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overX > 1 && overY > 1) {
          problems.push({
            kind: 'overlap',
            detail: `${name(boxes[i])} overlaps ${name(boxes[j])} by ${Math.round(overX)}x${Math.round(overY)}px`,
          });
        }
      }
    }

    const walk = (parent: Element) => {
      const kids = Array.from(parent.children).filter(inFlow);

      let managed = false;
      for (let p: Element | null = parent; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/auto|scroll|hidden/.test(s.overflowY) || /auto|scroll|hidden/.test(s.overflowX)) {
          managed = true;
          break;
        }
      }
      if (!managed) {
        const pr = parent.getBoundingClientRect();
        for (const kid of kids) {
          const kr = kid.getBoundingClientRect();
          const below = kr.bottom - pr.bottom;
          if (below > 1) {
            problems.push({
              kind: 'escapes-parent',
              detail: `${name(kid)} hangs ${Math.round(below)}px below its parent ${name(parent)}`,
            });
          }
        }
      }

      for (const kid of kids) walk(kid);
    };

    walk(root);
    return problems;
  }, selector);
}
