import { describe, expect, it } from 'vitest';
import { applyPlayheadMilestone, applySessionChip } from './sessionChip';
import type { TimelinePoint } from './sessionTimelineMath';

function node(text = '', hidden = false) {
  return { textContent: text, hidden };
}

function chipRoot(opts?: { slider?: boolean }) {
  const count = node();
  const date = node();
  const windowSep = node('·', true);
  const windowEl = node('', true);
  const diffSep = node('·', true);
  const added = node('', true);
  const removed = node('', true);
  const slider = opts?.slider === false ? null : { setAttribute: (k: string, v: string) => { sliderAttrs[k] = v; } };
  const sliderAttrs: Record<string, string> = {};
  const byTestId: Record<string, typeof count> = {
    'session-playhead-count': count,
    'session-playhead-date': date,
    'session-playhead-window-sep': windowSep,
    'session-playhead-window': windowEl,
    'session-playhead-diff-sep': diffSep,
    'session-playhead-added': added,
    'session-playhead-removed': removed,
  };
  return {
    count,
    date,
    windowSep,
    windowEl,
    diffSep,
    added,
    removed,
    sliderAttrs,
    root: {
      querySelector: (sel: string) => {
        const m = sel.match(/data-testid="([^"]+)"/);
        if (m) return byTestId[m[1]] ?? null;
        if (sel.includes('Scrub sessions')) return slider;
        return null;
      },
    } as unknown as ParentNode,
  };
}

const sitting: TimelinePoint = {
  t: Date.parse('2026-09-09T11:34:00Z'),
  count: 1,
  net: 6,
  added: 6,
  removed: 0,
  dur: 19 * 60,
};

const rest: TimelinePoint = {
  t: Date.parse('2026-09-15T13:40:00Z'),
  count: 14,
  net: 84,
  added: 0,
  removed: 0,
  dur: 60,
};

describe('applySessionChip', () => {
  it('paints date, clock, duration, and diff for a counts-only sitting', () => {
    const ui = chipRoot();
    applySessionChip(ui.root, rest, { tz: 'UTC', countUnit: 'of 14', deltaUnit: '' });
    applySessionChip(ui.root, sitting, { tz: 'UTC', countUnit: 'of 14', deltaUnit: '' });
    expect(ui.count.textContent).toBe('1');
    expect(ui.date.textContent).toBe('Sep 9');
    expect(ui.windowEl.hidden).toBe(false);
    expect(ui.windowEl.textContent).toContain('19m');
    expect(ui.windowEl.textContent).not.toContain('1m');
    expect(ui.added.hidden).toBe(false);
    expect(ui.added.textContent).toBe('+6');
    expect(ui.removed.hidden).toBe(true);
    expect(ui.diffSep.hidden).toBe(false);
    expect(ui.sliderAttrs['aria-valuetext']).toBe('Sep 9: 1 of 14');
  });

  it('clears a previous sitting diff when the current sitting has none', () => {
    const ui = chipRoot();
    applySessionChip(ui.root, sitting, { tz: 'UTC', countUnit: 'of 14', deltaUnit: '' });
    applySessionChip(ui.root, rest, { tz: 'UTC', countUnit: 'of 14', deltaUnit: '' });
    expect(ui.count.textContent).toBe('14');
    expect(ui.date.textContent).toBe('Sep 15');
    expect(ui.windowEl.textContent).toContain('1m');
    expect(ui.windowEl.textContent).not.toContain('19m');
    expect(ui.added.hidden).toBe(true);
    expect(ui.added.textContent).toBe('');
    expect(ui.diffSep.hidden).toBe(true);
  });
});

describe('applyPlayheadMilestone', () => {
  function milestoneRoot() {
    const attrs: Record<string, string> = { visibility: 'hidden' };
    const node = {
      textContent: '',
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
      getAttribute: (k: string) => attrs[k],
    };
    return {
      node,
      attrs,
      root: {
        querySelector: (sel: string) =>
          sel.includes('session-playhead-milestone') ? node : null,
      } as unknown as ParentNode,
    };
  }

  it('hides the label when the sitting has no milestones', () => {
    const ui = milestoneRoot();
    applyPlayheadMilestone(ui.root, { label: 'export · not now', x: 80, width: 320 });
    applyPlayheadMilestone(ui.root, { label: '', x: 40, width: 320 });
    expect(ui.node.textContent).toBe('');
    expect(ui.attrs.visibility).toBe('hidden');
  });

  it('paints one concatenated label at the playhead x', () => {
    const ui = milestoneRoot();
    applyPlayheadMilestone(ui.root, { label: 'card · league · league · close', x: 80, width: 320 });
    expect(ui.node.textContent).toBe('card · league · league · close');
    expect(ui.attrs.visibility).toBe('visible');
    expect(ui.attrs.x).toBe('80.0');
    expect(ui.attrs['text-anchor']).toBe('middle');
  });

  it('anchors the label at the chart edge', () => {
    const ui = milestoneRoot();
    applyPlayheadMilestone(ui.root, { label: 'intro', x: 10, width: 320 });
    expect(ui.attrs['text-anchor']).toBe('start');
    expect(ui.attrs.x).toBe('8.0');
    applyPlayheadMilestone(ui.root, { label: 'view', x: 310, width: 320 });
    expect(ui.attrs['text-anchor']).toBe('end');
    expect(ui.attrs.x).toBe('312.0');
  });
});
