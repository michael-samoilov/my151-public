import { describe, expect, it } from 'vitest';
import { applyLeaguePlayhead } from './memberPresence';

function playheadRoot(indexes: number[]) {
  const board = { hidden: false };
  const msg = { hidden: true };
  const sessionBoards = indexes.map((i) => ({
    hidden: false,
    getAttribute: (name: string) => (name === 'data-session-board' ? String(i) : null),
  }));
  return {
    board,
    msg,
    sessionBoards,
    root: {
      querySelectorAll: (sel: string) => (sel.includes('data-session-board') ? sessionBoards : []),
      querySelector: (sel: string) => {
        if (sel.includes('league-visit-board')) return board;
        if (sel.includes('league-uncaptured')) return msg;
        return null;
      },
    } as unknown as ParentNode,
  };
}

describe('applyLeaguePlayhead', () => {
  it('hides the board wrap and every snapshot when the sitting has no cards', () => {
    const { root, board, msg, sessionBoards } = playheadRoot([3, 13]);
    applyLeaguePlayhead(root, 0, [false, false, false, true]);
    expect(board.hidden).toBe(true);
    expect(msg.hidden).toBe(false);
    expect(sessionBoards.map((n) => n.hidden)).toEqual([true, true]);
  });

  it('shows only the playhead snapshot', () => {
    const { root, board, msg, sessionBoards } = playheadRoot([3, 12]);
    applyLeaguePlayhead(root, 0, [false, false, false, true]);
    applyLeaguePlayhead(root, 3, [false, false, false, true, false, false, false, false, false, false, false, false, true]);
    expect(board.hidden).toBe(false);
    expect(msg.hidden).toBe(true);
    expect(sessionBoards.map((n) => n.hidden)).toEqual([false, true]);
  });
});
