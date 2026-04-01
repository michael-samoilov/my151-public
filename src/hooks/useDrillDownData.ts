import { useMemo } from 'react';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { getPokemonById, getEvolutionLine } from '@/hooks/usePokemonData';
import { BUILD_GROUPS } from '@/data/slot-template';
import { TYPE_COLORS } from '@/data/type-colors';
import type { Pokemon } from '@/types/pokemon';

const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];
const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

const POKEAPI_TYPE_IDS: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};

interface SectionGroup {
  sectionId: string;
  sectionName: string;
  sectionColor: string;
  groups: {
    key: string;
    members: Pokemon[];
    matchedIds: Set<number>;
  }[];
}

export interface DrillDownData {
  title: string;
  subtitle: string;
  color: string;
  icon?: string;
  sections: SectionGroup[];
  totalPokemon: number;
  totalLines: number;
}

export function useDrillDownData(): DrillDownData | null {
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const storeSections = usePokedexStore((s) => s.sections);

  return useMemo(() => {
    if (!segment) return null;

    // Collect all placed Pokemon with their section assignments
    const pokemonToSection = new Map<number, string>();
    for (const [sectionId, ids] of Object.entries(storeSections)) {
      for (const id of ids) {
        pokemonToSection.set(id, sectionId);
      }
    }

    // Filter placed Pokemon based on segment criteria
    const matchingIds = new Set<number>();
    const allPlacedIds = [...pokemonToSection.keys()];

    for (const id of allPlacedIds) {
      const p = getPokemonById(id);
      if (!p) continue;
      if (matchesSegment(p, id, segment)) {
        matchingIds.add(id);
      }
    }

    if (matchingIds.size === 0) return null;

    // Build evolution line groups, deduped by root
    const seenRoots = new Set<string>();
    const evoLinesBySection = new Map<string, { key: string; members: Pokemon[]; matchedIds: Set<number> }[]>();

    for (const id of matchingIds) {
      const line = getEvolutionLine(id);
      const rootKey = line.map(m => m.id).join('-');
      if (seenRoots.has(rootKey)) continue;
      seenRoots.add(rootKey);

      // Figure out which section this line belongs to (use first placed member's section)
      let lineSectionId = 'other';
      for (const m of line) {
        const sec = pokemonToSection.get(m.id);
        if (sec) { lineSectionId = sec; break; }
      }

      const lineMatchedIds = new Set<number>();
      for (const m of line) {
        if (matchingIds.has(m.id)) lineMatchedIds.add(m.id);
      }

      const groups = evoLinesBySection.get(lineSectionId) ?? [];
      groups.push({ key: rootKey, members: line, matchedIds: lineMatchedIds });
      evoLinesBySection.set(lineSectionId, groups);
    }

    // Build sections in BUILD_GROUPS order
    const sections: SectionGroup[] = [];
    for (const bg of BUILD_GROUPS) {
      const groups = evoLinesBySection.get(bg.id);
      if (!groups || groups.length === 0) continue;
      groups.sort((a, b) => a.members[0].id - b.members[0].id);
      sections.push({
        sectionId: bg.id,
        sectionName: bg.name,
        sectionColor: bg.color,
        groups,
      });
    }

    const totalLines = seenRoots.size;
    const { title, color, icon } = getSegmentMeta(segment);

    return {
      title,
      subtitle: `${matchingIds.size} Pokémon across ${totalLines} line${totalLines !== 1 ? 's' : ''}`,
      color,
      icon,
      sections,
      totalPokemon: matchingIds.size,
      totalLines,
    };
  }, [segment, storeSections]);
}

function matchesSegment(p: Pokemon, id: number, segment: DrillDownSegment): boolean {
  switch (segment.kind) {
    case 'type':
      return p.types.includes(segment.type as never);
    case 'generation':
      return p.generation === segment.generation;
    case 'stage': {
      const line = getEvolutionLine(id);
      const lineLen = Math.min(line.length, 3);
      const stage = Math.min(p.evolutionStage, 3);
      return lineLen === segment.lineLength && stage === segment.stage;
    }
    case 'stageAll': {
      const stage = Math.min(p.evolutionStage, 3);
      return stage === segment.stage;
    }
    case 'lineLength': {
      const line = getEvolutionLine(id);
      const lineLen = Math.min(line.length, 3);
      return lineLen === segment.lineLength;
    }
    case 'evoLevel':
      return p.evolutionLevel !== undefined && p.evolutionLevel !== null &&
        p.evolutionLevel >= segment.binStart && p.evolutionLevel < segment.binEnd;
    case 'bst':
      return p.bst >= segment.binStart && p.bst < segment.binEnd;
  }
}

function getSegmentMeta(segment: DrillDownSegment): { title: string; color: string; icon?: string } {
  switch (segment.kind) {
    case 'type': {
      const cap = segment.type.charAt(0).toUpperCase() + segment.type.slice(1);
      const typeId = POKEAPI_TYPE_IDS[segment.type];
      return {
        title: `${cap} Type`,
        color: TYPE_COLORS[segment.type as keyof typeof TYPE_COLORS] ?? '#888',
        icon: typeId ? `/sprites/types/${typeId}.png` : undefined,
      };
    }
    case 'generation':
      return {
        title: `Generation ${segment.generation}`,
        color: GEN_COLORS[(segment.generation - 1) % GEN_COLORS.length],
      };
    case 'stage': {
      const names = ['Single', 'Double', 'Triple'];
      return {
        title: `${names[segment.lineLength - 1]}-Stage / Stage ${segment.stage}`,
        color: STAGE_COLORS[segment.stage - 1],
      };
    }
    case 'stageAll':
      return {
        title: `All Stage ${segment.stage} Pokémon`,
        color: STAGE_COLORS[segment.stage - 1],
      };
    case 'lineLength': {
      const names = ['Single', 'Double', 'Triple'];
      return {
        title: `${names[segment.lineLength - 1]}-Stage Lines`,
        color: STAGE_COLORS[segment.lineLength - 1],
      };
    }
    case 'evoLevel':
      return {
        title: `Evolves at Lv ${segment.binStart}–${segment.binEnd - 1}`,
        color: '#ef4444',
      };
    case 'bst':
      return {
        title: `BST ${segment.binStart}–${segment.binEnd - 1}`,
        color: '#ef4444',
      };
  }
}
