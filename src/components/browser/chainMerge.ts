import type { EvolutionGroup } from '@/hooks/usePokemonData';

export function mergeEvolutionBranches(groups: EvolutionGroup[], groupId?: (id: number) => number): EvolutionGroup[] {
  const byGroup = new Map<number, EvolutionGroup>();
  for (const group of groups) {
    const groupKey = groupId?.(group.members[0].id) ?? group.members[0].evolutionChainId;
    const merged = byGroup.get(groupKey);
    if (!merged) {
      byGroup.set(groupKey, {
        chainId: groupKey,
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
  return [...byGroup.values()];
}
