import { describe, expect, it } from 'vitest';
import { applyMemberPresence } from './memberPresence';

function tile(id: number) {
  return { dataset: { memberId: String(id) }, style: { opacity: '' } };
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
