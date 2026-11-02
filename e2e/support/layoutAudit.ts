import type { Page } from '@playwright/test';

interface LayoutProblem {
  kind: 'overlap' | 'escapes-parent';
  detail: string;
}

// platform: Playwright serializes the evaluated function's source, so it has no imports and no closure.
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
      // platform: SVG has no CSS box model, so an icon's overlapping paths are not a layout fault.
      if (el.closest('svg')) return false;

      // platform: Chrome lays out a closed <details> with content-visibility, so its content keeps a full-size rect while painting nothing.
      const details = el.closest('details');
      if (details && !details.open && !el.closest('summary')) return false;
      if (!el.checkVisibility()) return false;

      const s = getComputedStyle(el);
      if (s.position === 'absolute' || s.position === 'fixed') return false;
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };

    // platform: getBoundingClientRect ignores clipping ancestors, so the visible part is the intersection with each one.
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
