import type { EvolutionGroup } from '@/hooks/usePokemonData';

/**
 * One group per evolution chain, instead of one per branch.
 *
 * `useFilteredPokemonGrouped` emits a group for every root-to-leaf path, so a
 * split chain repeats every member above the split: Cosmog arrives twice,
 * once on the way to Solgaleo and once on the way to Lunala. That is right
 * when a tile IS the line, and wrong when each tile is its own pick, which is
 * what the signature and legendary pickers do.
 *
 * Merging keeps a chain's tiles adjacent — the reason the pickers draw lines
 * at all — while drawing each member exactly once. Members keep the order
 * they were first walked in, root to leaf, so a baby form still leads its
 * chain (dex order would put Pichu after Raichu).
 */
export function mergeBranchesByChain(groups: EvolutionGroup[]): EvolutionGroup[] {
  const byChain = new Map<number, EvolutionGroup>();
  for (const group of groups) {
    const chain = group.members[0].evolutionChainId;
    const merged = byChain.get(chain);
    if (!merged) {
      byChain.set(chain, {
        chainId: chain,
        members: [...group.members],
        matchedIds: new Set(group.matchedIds),
      });
      continue;
    }
    for (const member of group.members) {
      if (!merged.members.some((m) => m.id === member.id)) merged.members.push(member);
    }
    for (const id of group.matchedIds) merged.matchedIds.add(id);
  }
  return [...byChain.values()];
}
