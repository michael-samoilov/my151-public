import { occupancyPresent, type LeagueOccupancy } from '@/components/admin/leaguePlayhead';

const ABSENT_OPACITY = '0.14';

export function applyMemberPresence(root: ParentNode, present: ReadonlySet<number> | null): void {
  for (const node of root.querySelectorAll('[data-member-id]')) {
    const el = node as HTMLElement;
    const id = Number(el.dataset.memberId);
    el.style.opacity = !present || present.has(id) ? '1' : ABSENT_OPACITY;
  }
}

function setHidden(node: Element | null, hidden: boolean): void {
  if (node) (node as HTMLElement).hidden = hidden;
}

export function applyLeaguePlayhead(root: ParentNode, occupancy: LeagueOccupancy): void {
  applyMemberPresence(root, occupancyPresent(occupancy));
  const captured = occupancy.kind !== 'none';
  setHidden(root.querySelector('[data-testid="league-visit-board"]'), !captured);
  setHidden(root.querySelector('[data-testid="league-uncaptured"]'), captured);
}
