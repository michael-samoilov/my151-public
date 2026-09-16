const ABSENT_OPACITY = '0.14';

/** Fade tiles that are not in the scrubbed session. `present === null` shows every tile. */
export function applyMemberPresence(root: ParentNode, present: ReadonlySet<number> | null): void {
  for (const node of root.querySelectorAll('[data-member-id]')) {
    const el = node as HTMLElement;
    const id = Number(el.dataset.memberId);
    el.style.opacity = !present || present.has(id) ? '1' : ABSENT_OPACITY;
  }
}
