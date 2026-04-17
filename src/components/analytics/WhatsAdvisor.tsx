import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById, getAllPokemon, getEvolutionChainIds } from '@/hooks/usePokemonData';
import { CATEGORIES } from '@/data/categories';
import { ARCHETYPES } from '@/data/archetypes';
import pokemonData from '@/data/pokemon.json';
import type { Pokemon } from '@/types/pokemon';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronDown } from 'lucide-react';

const pokemonList = pokemonData as Pokemon[];

// National type frequency baseline (proportion of national-dex Pokemon that have each type)
let _nationalTypeFreq: Map<string, number> | null = null;
function getNationalTypeFreq(): Map<string, number> {
  if (_nationalTypeFreq) return _nationalTypeFreq;
  const all = getAllPokemon();
  const freq = new Map<string, number>();
  for (const p of all) {
    for (const t of p.types) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const total = all.length;
  for (const [t, count] of freq) freq.set(t, count / total);
  _nationalTypeFreq = freq;
  return freq;
}

// Early-route archetype IDs for the late-evolution warning
const EARLY_ROUTE_IDS = new Set([
  ...ARCHETYPES.find(a => a.id === 'early-bug')!.pokemonIds,
  ...ARCHETYPES.find(a => a.id === 'early-bird')!.pokemonIds,
  ...ARCHETYPES.find(a => a.id === 'early-rodent')!.pokemonIds,
]);

function GreenPokeball({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <path d="M1 8 A7 7 0 0 1 15 8" fill="#22c55e" stroke="#22c55e" strokeWidth="1.5" />
      <path d="M1 8 A7 7 0 0 0 15 8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="#22c55e" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="white" stroke="#22c55e" strokeWidth="1.5" />
    </svg>
  );
}

export function WhatsAdvisor() {
  const sections = usePokedexStore((s) => s.sections);
  const expanded = usePokedexStore((s) => s.whatsAdvisorExpanded);
  const setExpanded = usePokedexStore((s) => s.setWhatsAdvisorExpanded);

  const advice = useMemo(() => {
    const items: { type: 'missing' | 'suggestion' | 'complete'; text: string }[] = [];

    // Check total fill
    const totalPlaced = Object.values(sections).reduce((s, a) => s + a.length, 0);
    if (totalPlaced === 0) {
      items.push({ type: 'missing', text: 'Pokedex is empty' });
    } else if (totalPlaced < 151) {
      items.push({ type: 'suggestion', text: `${totalPlaced}/151 filled` });
    } else if (totalPlaced === 151) {
      items.push({ type: 'complete', text: '151/151 filled!' });
    } else {
      items.push({ type: 'missing', text: `${totalPlaced}/151 — over by ${totalPlaced - 151}. Remove some Pokémon to reach 151.` });
    }

    // Check archetype coverage
    const allIds = new Set(Object.values(sections).flat());

    // Starter check: count distinct evolution chains in the starter section
    const starterIds = sections['starter'] ?? [];
    {
      const starterChains = new Set<number>();
      for (const id of starterIds) {
        const p = getPokemonById(id);
        if (p) starterChains.add(p.evolutionChainId);
      }
      if (starterChains.size >= 3) {
        items.push({ type: 'complete', text: `${starterChains.size} Starter lines represented` });
      } else if (starterChains.size > 0) {
        items.push({ type: 'suggestion', text: `${starterChains.size}/3 Starter lines (need 3)` });
      } else {
        items.push({ type: 'missing', text: 'No Starter assigned yet' });
      }
    }

    // Other archetype checks
    const otherCategories = ['pseudo-legendary', 'legendary', 'mythical'];
    for (const catId of otherCategories) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      if (!cat) continue;
      const hasAny = pokemonList.some((p) => cat.filter(p) && allIds.has(p.id));
      if (hasAny) {
        items.push({ type: 'complete', text: `${cat.name} represented` });
      } else {
        items.push({ type: 'missing', text: `No ${cat.name} assigned yet` });
      }
    }

    // Check type coverage
    const typeCoverage = new Set<string>();
    for (const id of allIds) {
      const pokemon = getPokemonById(id);
      if (pokemon) {
        for (const t of pokemon.types) typeCoverage.add(t);
      }
    }
    const allTypes = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
    const missingTypes = allTypes.filter((t) => !typeCoverage.has(t));
    if (missingTypes.length > 0) {
      items.push({ type: 'missing', text: `Missing types: ${missingTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')}` });
    } else {
      items.push({ type: 'complete', text: 'All 18 types covered' });
    }

    // Type over-representation warning (>2x vs national, in BOTH full and filtered pools)
    if (totalPlaced >= 15) {
      const nationalTypeFreq = getNationalTypeFreq();
      const placedPokemon = [...allIds].map(id => getPokemonById(id)).filter((p): p is Pokemon => !!p);

      function typeRatios(pool: Pokemon[]): Map<string, number> {
        const count = new Map<string, number>();
        for (const p of pool) {
          for (const t of p.types) count.set(t, (count.get(t) ?? 0) + 1);
        }
        const n = pool.length;
        const ratios = new Map<string, number>();
        for (const [t, c] of count) {
          const natRatio = nationalTypeFreq.get(t) ?? 0;
          if (natRatio > 0) ratios.set(t, (c / n) / natRatio);
        }
        return ratios;
      }

      const ratiosAll = typeRatios(placedPokemon);
      const starterSet = new Set(sections['starter'] ?? []);
      const filteredPool = placedPokemon.filter(p => !p.isLegendary && !p.isMythical && !starterSet.has(p.id));
      const ratiosFiltered = filteredPool.length >= 10 ? typeRatios(filteredPool) : ratiosAll;

      const overRepTypes: string[] = [];
      for (const [t, ratioAll] of ratiosAll) {
        const ratioFilt = ratiosFiltered.get(t) ?? 0;
        if (ratioAll > 2 && ratioFilt > 2) {
          overRepTypes.push(t.charAt(0).toUpperCase() + t.slice(1));
        }
      }
      if (overRepTypes.length > 0) {
        items.push({
          type: 'missing',
          text: `Over-represented type${overRepTypes.length > 1 ? 's' : ''}: ${overRepTypes.join(', ')} (>2× national dex proportion)`,
        });
      }
    }

    // Late-evolving early route Pokemon warning (direct evolution from base form at level 40+)
    {
      const lateEvoWarnings: string[] = [];
      const checkedChains = new Set<number>();

      for (const id of allIds) {
        const pokemon = getPokemonById(id);
        if (!pokemon || !EARLY_ROUTE_IDS.has(id)) continue;
        if (checkedChains.has(pokemon.evolutionChainId)) continue;
        checkedChains.add(pokemon.evolutionChainId);

        // Find the base form (stage 1, no evolvesFrom) of this chain
        const chainIds = getEvolutionChainIds(id);
        const chainMembers = chainIds.map(cid => getPokemonById(cid)).filter((p): p is Pokemon => !!p);
        const baseForm = chainMembers.find(p => p.evolvesFrom === null) ?? chainMembers[0];

        // Only flag direct evolutions from the base form (not later stages)
        for (const member of chainMembers) {
          if (
            member.evolvesFrom === baseForm.id &&
            member.evolutionLevel != null &&
            member.evolutionLevel >= 40
          ) {
            const name = member.name.charAt(0).toUpperCase() + member.name.slice(1);
            lateEvoWarnings.push(`${name} (Lvl. ${member.evolutionLevel})`);
            break; // one warning per chain
          }
        }
      }
      if (lateEvoWarnings.length > 0) {
        items.push({
          type: 'missing',
          text: `Early route Pokémon with late evolutions: ${lateEvoWarnings.join(', ')}`,
        });
      }
    }

    return items;
  }, [sections]);

  const gapCount = advice.filter((a) => a.type === 'missing' || a.type === 'suggestion').length;
  const completeCount = advice.filter((a) => a.type === 'complete').length;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-6 pt-5 pb-4"
      >
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <h3 className="text-lg font-semibold">What's Missing?</h3>
        {gapCount > 0 && (
          <Badge className="text-xs bg-yellow-500 text-white">{gapCount} {gapCount === 1 ? 'gap' : 'gaps'}</Badge>
        )}
        {gapCount === 0 && completeCount > 0 && (
          <Badge className="text-xs bg-green-600">Looking good!</Badge>
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 px-6 pb-5 mt-1">
          {advice.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {item.type === 'missing' && (
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              )}
              {item.type === 'suggestion' && (
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              )}
              {item.type === 'complete' && (
                <GreenPokeball className="w-4 h-4 flex-shrink-0" />
              )}
              <span className={item.type === 'complete' ? 'text-muted-foreground' : ''}>
                {item.text}
              </span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground italic">
            Tip: Press chart bars to see which Pokémon are driving trends in your dex
          </p>
        </div>
      )}
    </div>
  );
}
