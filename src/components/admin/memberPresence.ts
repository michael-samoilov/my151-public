function setHidden(node: Element | null, hidden: boolean): void {
  if (node) (node as HTMLElement).hidden = hidden;
}

export function applyLeaguePlayhead(root: ParentNode, playhead: number, captured: boolean[]): void {
  const shown = captured[playhead] === true;
  setHidden(root.querySelector('[data-testid="league-visit-board"]'), !shown);
  setHidden(root.querySelector('[data-testid="league-uncaptured"]'), shown);
  for (const node of root.querySelectorAll('[data-session-board]')) {
    setHidden(node, Number(node.getAttribute('data-session-board')) !== playhead);
  }
}
