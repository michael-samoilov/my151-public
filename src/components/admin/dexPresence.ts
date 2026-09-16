const ABSENT_OPACITY = '0.14';

export function applyDexPresence(root: ParentNode, present: ReadonlySet<number>): void {
  for (const node of root.querySelectorAll('[data-dex-id]')) {
    const el = node as HTMLElement;
    el.style.opacity = present.has(Number(el.dataset.dexId)) ? '1' : ABSENT_OPACITY;
  }
}
