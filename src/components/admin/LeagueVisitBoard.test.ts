import { describe, expect, it } from 'vitest';
import { applyLeaguePlayhead, applyMemberPresence } from './memberPresence';

function tile(id: number) {
  return { dataset: { memberId: String(id) }, style: { opacity: '' } };
}

function playheadRoot(tiles: ReturnType<typeof tile>[]) {
  const board = { hidden: false };
  const msg = { hidden: true };
  return {
    tiles,
    board,
    msg,
    root: {
      querySelectorAll: () => tiles,
      querySelector: (sel: string) => {
        if (sel.includes('league-visit-board')) return board;
        if (sel.includes('league-uncaptured')) return msg;
        return null;
      },
    } as unknown as ParentNode,
  };
}

describe('applyMemberPresence', () => {
  it('fades ids that are not in the session set', () => {
    const nodes = [tile(1), tile(4), tile(9)];
    applyMemberPresence(
      { querySelectorAll: () => nodes } as unknown as ParentNode,
      new Set([1, 9]),
    );
    expect(nodes.map((n) => n.style.opacity)).toEqual(['1', '0.14', '1']);
  });

  it('shows every tile when present is null', () => {
    const nodes = [tile(1), tile(2)];
    nodes[0].style.opacity = '0.14';
    applyMemberPresence({ querySelectorAll: () => nodes } as unknown as ParentNode, null);
    expect(nodes.map((n) => n.style.opacity)).toEqual(['1', '1']);
  });

  it('fades every tile when present is an empty set', () => {
    const nodes = [tile(1), tile(2)];
    applyMemberPresence({ querySelectorAll: () => nodes } as unknown as ParentNode, new Set());
    expect(nodes.map((n) => n.style.opacity)).toEqual(['0.14', '0.14']);
  });
});

describe('applyLeaguePlayhead', () => {
  it('hides the board and shows the uncaptured line when occupancy is none', () => {
    const { root, tiles, board, msg } = playheadRoot([tile(1), tile(2)]);
    applyLeaguePlayhead(root, { kind: 'none' });
    expect(board.hidden).toBe(true);
    expect(msg.hidden).toBe(false);
    expect(tiles.map((n) => n.style.opacity)).toEqual(['0.14', '0.14']);
    expect(tiles).toHaveLength(2);
  });

  it('keeps the same tiles and fades absentees when occupancy is members', () => {
    const { root, tiles, board, msg } = playheadRoot([tile(1), tile(2)]);
    applyLeaguePlayhead(root, { kind: 'none' });
    applyLeaguePlayhead(root, { kind: 'members', ids: [1] });
    expect(board.hidden).toBe(false);
    expect(msg.hidden).toBe(true);
    expect(tiles.map((n) => n.style.opacity)).toEqual(['1', '0.14']);
  });

  it('shows every tile when occupancy is all', () => {
    const { root, tiles, board, msg } = playheadRoot([tile(1), tile(2)]);
    applyLeaguePlayhead(root, { kind: 'none' });
    applyLeaguePlayhead(root, { kind: 'all' });
    expect(board.hidden).toBe(false);
    expect(msg.hidden).toBe(true);
    expect(tiles.map((n) => n.style.opacity)).toEqual(['1', '1']);
  });
});
