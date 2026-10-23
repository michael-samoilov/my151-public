

const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

const TYPE_MAP: Record<number, string> = {
  1: 'normal', 2: 'fighting', 3: 'flying', 4: 'poison', 5: 'ground',
  6: 'rock', 7: 'bug', 8: 'ghost', 9: 'steel', 10: 'fire',
  11: 'water', 12: 'grass', 13: 'electric', 14: 'psychic', 15: 'ice',
  16: 'dragon', 17: 'dark', 18: 'fairy',
};

const GROWTH_RATE_MAP: Record<number, string> = {
  1: 'slow', 2: 'medium', 3: 'fast', 4: 'medium-slow', 5: 'erratic', 6: 'fluctuating',
};

async function fetchCSV(filename: string): Promise<string[][]> {
  const res = await fetch(`${BASE_URL}/${filename}`);
  const text = await res.text();
  return text.trim().split('\n').map(line => line.split(','));
}

async function main() {
  console.log('Fetching Pokemon data from PokeAPI CSVs...');

  const [pokemonRows, speciesRows, typeRows, statRows, evoRows] = await Promise.all([
    fetchCSV('pokemon.csv'),
    fetchCSV('pokemon_species.csv'),
    fetchCSV('pokemon_types.csv'),
    fetchCSV('pokemon_stats.csv'),
    fetchCSV('pokemon_evolution.csv'),
  ]);

  const speciesMap = new Map<number, Record<string, string>>();
  const speciesHeader = speciesRows[0];
  for (let i = 1; i < speciesRows.length; i++) {
    const row = speciesRows[i];
    const entry: Record<string, string> = {};
    speciesHeader.forEach((h, j) => { entry[h] = row[j]; });
    speciesMap.set(parseInt(row[0]), entry);
  }

  const pokemonMap = new Map<number, Record<string, string>>();
  const pokemonHeader = pokemonRows[0];
  for (let i = 1; i < pokemonRows.length; i++) {
    const row = pokemonRows[i];
    const entry: Record<string, string> = {};
    pokemonHeader.forEach((h, j) => { entry[h] = row[j]; });
    if (entry.is_default === '1') {
      pokemonMap.set(parseInt(row[0]), entry);
    }
  }

  const typesMap = new Map<number, string[]>();
  for (let i = 1; i < typeRows.length; i++) {
    const [pokemonId, typeId, slot] = typeRows[i];
    const pid = parseInt(pokemonId);
    if (!typesMap.has(pid)) typesMap.set(pid, []);
    const types = typesMap.get(pid)!;
    const typeName = TYPE_MAP[parseInt(typeId)];
    if (typeName && parseInt(slot) <= 2) {
      types[parseInt(slot) - 1] = typeName;
    }
  }

  const statsMap = new Map<number, number[]>();
  for (let i = 1; i < statRows.length; i++) {
    const [pokemonId, statId, baseStat] = statRows[i];
    const pid = parseInt(pokemonId);
    if (!statsMap.has(pid)) statsMap.set(pid, [0, 0, 0, 0, 0, 0]);
    const stats = statsMap.get(pid)!;
    stats[parseInt(statId) - 1] = parseInt(baseStat);
  }

  const evoLevelMap = new Map<number, number>();
  const evoHeader = evoRows[0];
  for (let i = 1; i < evoRows.length; i++) {
    const row = evoRows[i];
    const entry: Record<string, string> = {};
    evoHeader.forEach((h, j) => { entry[h] = row[j]; });
    if (entry.minimum_level) {
      evoLevelMap.set(parseInt(entry.evolved_species_id), parseInt(entry.minimum_level));
    }
  }

  const result = [];
  for (const [id, species] of speciesMap) {
    const pokemon = pokemonMap.get(id);
    if (!pokemon) continue;

    const types = typesMap.get(id) || ['normal'];
    const rawStats = statsMap.get(id) || [50, 50, 50, 50, 50, 50];
    const stats = {
      hp: rawStats[0], atk: rawStats[1], def: rawStats[2],
      spa: rawStats[3], spd: rawStats[4], spe: rawStats[5],
    };

    let stage: 1 | 2 | 3 = 1;
    if (species.evolves_from_species_id) {
      const parentSpecies = speciesMap.get(parseInt(species.evolves_from_species_id));
      if (parentSpecies?.evolves_from_species_id) {
        stage = 3;
      } else {
        stage = 2;
      }
    }

    result.push({
      id,
      name: species.identifier,
      types: types.filter(Boolean),
      stats,
      bst: Object.values(stats).reduce((a, b) => a + b, 0),
      generation: parseInt(species.generation_id),
      evolutionChainId: parseInt(species.evolution_chain_id) || 0,
      evolvesFrom: species.evolves_from_species_id ? parseInt(species.evolves_from_species_id) : null,
      evolutionStage: stage,
      evolutionLevel: evoLevelMap.get(id) || null,
      isLegendary: species.is_legendary === '1',
      isMythical: species.is_mythical === '1',
      captureRate: parseInt(species.capture_rate) || 45,
      growthRate: GROWTH_RATE_MAP[parseInt(species.growth_rate_id)] || 'medium',
      isBaby: species.is_baby === '1',
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    });
  }

  result.sort((a, b) => a.id - b.id);

  const { writeFileSync } = await import('fs');
  const { resolve } = await import('path');
  const outPath = resolve(import.meta.dirname ?? '.', '..', 'src', 'data', 'pokemon.json');
  writeFileSync(outPath, JSON.stringify(result, null, 0));
  console.log(`Wrote ${result.length} Pokemon to ${outPath}`);
}

main().catch(console.error);
