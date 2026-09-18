import { formatSessionMeta, type TimelinePoint } from './sessionTimelineMath';

function setHidden(node: Element | null, hidden: boolean): void {
  if (node) (node as HTMLElement).hidden = hidden;
}

function setText(node: Element | null, text: string): void {
  if (node) node.textContent = text;
}

export function applySessionChip(
  root: ParentNode,
  point: TimelinePoint,
  args: { tz?: string; countUnit: string; deltaUnit: string },
): void {
  const meta = formatSessionMeta(point, args.tz);
  setText(root.querySelector('[data-testid="session-playhead-count"]'), String(point.count));
  setText(root.querySelector('[data-testid="session-playhead-date"]'), meta.date);
  const windowEl = root.querySelector('[data-testid="session-playhead-window"]');
  setText(windowEl, meta.window ?? '');
  setHidden(windowEl, !meta.window);
  setHidden(root.querySelector('[data-testid="session-playhead-window-sep"]'), !meta.window);
  const added = root.querySelector('[data-testid="session-playhead-added"]');
  setText(added, meta.added != null ? `+${meta.added}${args.deltaUnit}` : '');
  setHidden(added, meta.added == null);
  const removed = root.querySelector('[data-testid="session-playhead-removed"]');
  const gap = meta.added != null ? ' ' : '';
  setText(removed, meta.removed != null ? `${gap}−${meta.removed}${args.deltaUnit}` : '');
  setHidden(removed, meta.removed == null);
  setHidden(root.querySelector('[data-testid="session-playhead-diff-sep"]'), !meta.diff);
  const slider = root.querySelector('input[aria-label="Scrub sessions"]');
  if (slider) {
    slider.setAttribute('aria-valuetext', `${meta.date}: ${point.count} ${args.countUnit}`);
  }
}
