import { useMemo } from 'react';
import { categoryName, formatList, t, tn, typeLabel } from '@/i18n';
import type { TypeName } from '@/types/pokemon';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById, getAllPokemon, getEvolutionChainIds, withoutSpecials } from '@/hooks/usePokemonData';
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
      items.push({ type: 'missing', text: t('advisor.empty') });
    } else if (totalPlaced < 151) {
      items.push({ type: 'suggestion', text: t('advisor.filled', { count: totalPlaced }) });
    } else if (totalPlaced === 151) {
      items.push({ type: 'complete', text: t('advisor.complete') });
    } else {
      items.push({ type: 'missing', text: t('advisor.over', { count: totalPlaced, over: totalPlaced - 151 }) });
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
        items.push({ type: 'complete', text: tn('advisor.starterLines', starterChains.size) });
      } else if (starterChains.size > 0) {
        items.push({ type: 'suggestion', text: t('advisor.starterProgress', { count: starterChains.size }) });
      } else {
        items.push({ type: 'missing', text: t('advisor.noStarter') });
      }
    }

    // Other archetype checks
    const otherCategories = ['pseudo-legendary', 'legendary', 'mythical'];
    for (const catId of otherCategories) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      if (!cat) continue;
      const hasAny = pokemonList.some((p) => cat.filter(p) && allIds.has(p.id));
      if (hasAny) {
        items.push({ type: 'complete', text: t('advisor.categoryPresent', { category: categoryName(cat.id) }) });
      } else {
        items.push({ type: 'missing', text: t('advisor.categoryMissing', { category: categoryName(cat.id) }) });
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
      items.push({ type: 'missing', text: t('advisor.missingTypes', { types: formatList(missingTypes.map((mt) => typeLabel(mt as TypeName))) }) });
    } else {
      items.push({ type: 'complete', text: t('advisor.allTypes') });
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
      const filteredPool = withoutSpecials(placedPokemon, starterSet);
      const ratiosFiltered = filteredPool.length >= 10 ? typeRatios(filteredPool) : ratiosAll;

      const overRepTypes: string[] = [];
      for (const [t, ratioAll] of ratiosAll) {
        const ratioFilt = ratiosFiltered.get(t) ?? 0;
        if (ratioAll > 2 && ratioFilt > 2) {
          overRepTypes.push(typeLabel(t as TypeName));
        }
      }
      if (overRepTypes.length > 0) {
        items.push({
          type: 'missing',
          text: tn('advisor.overRepresented', overRepTypes.length, { types: formatList(overRepTypes) }),
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
            lateEvoWarnings.push(t('advisor.lateEvoEntry', { name, level: member.evolutionLevel }));
            break; // one warning per chain
          }
        }
      }
      if (lateEvoWarnings.length > 0) {
        items.push({
          type: 'missing',
          text: t('advisor.lateEvo', { names: formatList(lateEvoWarnings) }),
        });
      }
    }

    return items;
  }, [sections]);

  const gapCount = advice.filter((a) => a.type === 'missing' || a.type === 'suggestion').length;
  const completeCount = advice.filter((a) => a.type === 'complete').length;

  return (
    <div>
      <button type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-6 pt-3 pb-2"
      >
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <h3 className="text-lg font-semibold">{t('advisor.heading')}</h3>
        {gapCount > 0 && (
          <Badge className="text-xs bg-yellow-500 text-white">{tn('advisor.gaps', gapCount)}</Badge>
        )}
        {gapCount === 0 && completeCount > 0 && (
          <Badge className="text-xs bg-green-600">{t('advisor.lookingGood')}</Badge>
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 px-6 pb-3 mt-1">
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
