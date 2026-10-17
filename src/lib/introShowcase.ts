import { BUILD_GROUPS } from '@/data/slot-template';
import { DEMO_DEX_SECTIONS } from '@/data/demoDex';
import { getPokemonById } from '@/hooks/usePokemonData';

export interface ShowcaseStage {
  count: number;
  sections: Record<string, number[]>;
}

const STAGE_TARGETS = [45, 95] as const;

interface EvoLine {
  groupId: string;
  ids: number[];
}

function demoDexLines(): EvoLine[] {
  const lines: EvoLine[] = [];
  for (const g of BUILD_GROUPS) {
    const ids = DEMO_DEX_SECTIONS[g.id];
    if (!ids?.length) continue;
    let current: EvoLine | null = null;
    let prevChain: number | null = null;
    for (const id of ids) {
      const chain = getPokemonById(id)?.evolutionChainId ?? -id;
      if (!current || chain !== prevChain) {
        current = { groupId: g.id, ids: [] };
        lines.push(current);
      }
      current.ids.push(id);
      prevChain = chain;
    }
  }
  return lines;
}

export function computeShowcaseStages(): [ShowcaseStage, ShowcaseStage, ShowcaseStage] {
  const lines = demoDexLines();

  const cuts: number[] = [];
  let cum = 0;
  for (const l of lines) {
    cum += l.ids.length;
    cuts.push(cum);
  }
  const total = cum;

  const stageFor = (target: number): ShowcaseStage => {
    let bestIdx = 0;
    for (let i = 1; i < cuts.length; i++) {
      if (Math.abs(cuts[i] - target) < Math.abs(cuts[bestIdx] - target)) bestIdx = i;
    }
    const sections: Record<string, number[]> = {};
    for (let i = 0; i <= bestIdx; i++) {
      const l = lines[i];
      (sections[l.groupId] ??= []).push(...l.ids);
    }
    return { count: cuts[bestIdx], sections };
  };

  const full: ShowcaseStage = {
    count: total,
    sections: Object.fromEntries(
      Object.entries(DEMO_DEX_SECTIONS).map(([k, v]) => [k, [...v]]),
    ),
  };

  return [stageFor(STAGE_TARGETS[0]), stageFor(STAGE_TARGETS[1]), full];
}
