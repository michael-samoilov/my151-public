import { useMemo, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { CATEGORIES } from '@/data/categories';
import pokemonData from '@/data/pokemon.json';
import type { Pokemon } from '@/types/pokemon';

const pokemonList = pokemonData as Pokemon[];
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';

export function WhatsAdvisor() {
  const sections = usePokedexStore((s) => s.sections);
  const [expanded, setExpanded] = useState(true);

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
      items.push({ type: 'missing', text: `${totalPlaced}/151 — over by ${totalPlaced - 151}. Remove some Pokemon to reach 151.` });
    }

    // Check archetype coverage
    const allIds = new Set(Object.values(sections).flat());

    const criticalCategories = ['starter', 'pseudo-legendary', 'legendary', 'mythical'];
    for (const catId of criticalCategories) {
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

    return items;
  }, [sections]);

  const missingCount = advice.filter((a) => a.type === 'missing').length;
  const completeCount = advice.filter((a) => a.type === 'complete').length;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <h3 className="text-lg font-semibold">What's Missing?</h3>
        {missingCount > 0 && (
          <Badge className="text-xs bg-yellow-500 text-white">{missingCount} gaps</Badge>
        )}
        {missingCount === 0 && completeCount > 0 && (
          <Badge className="text-xs bg-green-600">Looking good!</Badge>
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 mt-3">
          {advice.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {item.type === 'missing' && (
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              )}
              {item.type === 'suggestion' && (
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              )}
              {item.type === 'complete' && (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
              <span className={item.type === 'complete' ? 'text-muted-foreground' : ''}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
