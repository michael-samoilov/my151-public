import { useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { ARCHETYPES } from '@/data/archetypes';
import { DEX_SECTIONS } from '@/data/slot-template';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function WhatsAdvisor() {
  const slots = usePokedexStore((s) => s.slots);

  const advice = useMemo(() => {
    const items: { type: 'missing' | 'suggestion' | 'complete'; text: string }[] = [];

    // Check each section for completion
    for (const section of DEX_SECTIONS) {
      const sectionSlots = slots.filter(
        (s) => s.slotNumber >= section.startSlot && s.slotNumber <= section.endSlot
      );
      const filled = sectionSlots.filter((s) => s.pokemonId !== null).length;
      const total = sectionSlots.length;

      if (filled === 0) {
        items.push({ type: 'missing', text: `${section.name} section is empty (${total} slots)` });
      } else if (filled < total) {
        items.push({ type: 'suggestion', text: `${section.name}: ${filled}/${total} filled` });
      } else {
        items.push({ type: 'complete', text: `${section.name} complete!` });
      }
    }

    // Check archetype coverage
    const filledPokemonIds = new Set(
      slots.filter((s) => s.pokemonId !== null).map((s) => s.pokemonId!)
    );

    const criticalArchetypes = ['grass-starter', 'fire-starter', 'water-starter', 'pseudo-legendary', 'legendary-trio', 'box-legendary', 'mythical'];
    for (const archetypeId of criticalArchetypes) {
      const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
      if (!archetype) continue;

      const hasAny = archetype.pokemonIds.some((id) => filledPokemonIds.has(id));
      if (!hasAny) {
        items.push({ type: 'missing', text: `No ${archetype.name} assigned yet` });
      }
    }

    // Check type coverage
    const typeCoverage = new Set<string>();
    for (const slot of slots) {
      if (!slot.pokemonId) continue;
      const pokemon = getPokemonById(slot.pokemonId);
      if (pokemon) {
        for (const t of pokemon.types) typeCoverage.add(t);
      }
    }
    const allTypes = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
    const missingTypes = allTypes.filter((t) => !typeCoverage.has(t));
    if (missingTypes.length > 0) {
      items.push({ type: 'missing', text: `Missing types: ${missingTypes.join(', ')}` });
    }

    return items;
  }, [slots]);

  const missingCount = advice.filter((a) => a.type === 'missing').length;
  const completeCount = advice.filter((a) => a.type === 'complete').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">What's Missing?</h3>
        {missingCount > 0 && (
          <Badge variant="destructive" className="text-xs">{missingCount} gaps</Badge>
        )}
        {missingCount === 0 && completeCount > 0 && (
          <Badge className="text-xs bg-green-600">Looking good!</Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {advice.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm"
          >
            {item.type === 'missing' && (
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
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
    </div>
  );
}
