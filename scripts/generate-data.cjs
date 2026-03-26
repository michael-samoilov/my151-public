#!/usr/bin/env node
/**
 * Fetches Pokemon data from PokeAPI's raw CSV files on GitHub
 * and generates src/data/pokemon.json
 *
 * Run: node scripts/generate-data.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i]);
    return obj;
  });
}

const TYPE_MAP = {
  1: 'normal', 2: 'fighting', 3: 'flying', 4: 'poison', 5: 'ground',
  6: 'rock', 7: 'bug', 8: 'ghost', 9: 'steel', 10: 'fire',
  11: 'water', 12: 'grass', 13: 'electric', 14: 'psychic', 15: 'ice',
  16: 'dragon', 17: 'dark', 18: 'fairy',
};

const GROWTH_MAP = {
  1: 'slow', 2: 'medium', 3: 'fast', 4: 'medium-slow', 5: 'erratic', 6: 'fluctuating',
};

async function main() {
  console.log('Fetching CSV data from PokeAPI GitHub...');

  const [speciesText, pokemonText, typesText, statsText, evoText] = await Promise.all([
    fetch(`${BASE}/pokemon_species.csv`),
    fetch(`${BASE}/pokemon.csv`),
    fetch(`${BASE}/pokemon_types.csv`),
    fetch(`${BASE}/pokemon_stats.csv`),
    fetch(`${BASE}/pokemon_evolution.csv`),
  ]);

  console.log('Parsing CSV data...');

  const species = parseCSV(speciesText);
  const pokemon = parseCSV(pokemonText);
  const types = parseCSV(typesText);
  const stats = parseCSV(statsText);
  const evos = parseCSV(evoText);

  // Build maps
  const speciesMap = new Map();
  for (const s of species) {
    speciesMap.set(parseInt(s.id), s);
  }

  // Only default forms
  const pokemonMap = new Map();
  for (const p of pokemon) {
    if (p.is_default === '1') {
      pokemonMap.set(parseInt(p.id), p);
    }
  }

  // Types by pokemon_id
  const typesMap = new Map();
  for (const t of types) {
    const pid = parseInt(t.pokemon_id);
    const slot = parseInt(t.slot);
    const typeName = TYPE_MAP[parseInt(t.type_id)];
    if (!typeName || slot > 2) continue;
    if (!typesMap.has(pid)) typesMap.set(pid, []);
    typesMap.get(pid)[slot - 1] = typeName;
  }

  // Stats by pokemon_id
  const statsMap = new Map();
  for (const s of stats) {
    const pid = parseInt(s.pokemon_id);
    const statId = parseInt(s.stat_id);
    const base = parseInt(s.base_stat);
    if (statId > 6) continue;
    if (!statsMap.has(pid)) statsMap.set(pid, [0, 0, 0, 0, 0, 0]);
    statsMap.get(pid)[statId - 1] = base;
  }

  // Evolution levels
  const evoLevelMap = new Map();
  for (const e of evos) {
    if (e.minimum_level && e.minimum_level !== '') {
      evoLevelMap.set(parseInt(e.evolved_species_id), parseInt(e.minimum_level));
    }
  }

  console.log('Building Pokemon data...');

  const result = [];
  let chainCounter = 0;
  const chainMap = new Map();

  for (const [id, sp] of speciesMap) {
    if (id > 1025) continue; // Only up to Gen 9

    const pk = pokemonMap.get(id);
    if (!pk) continue;

    const typeArr = typesMap.get(id) || ['normal'];
    const rawStats = statsMap.get(id) || [50, 50, 50, 50, 50, 50];
    const statsObj = {
      hp: rawStats[0], atk: rawStats[1], def: rawStats[2],
      spa: rawStats[3], spd: rawStats[4], spe: rawStats[5],
    };

    let stage = 1;
    const evolvesFrom = sp.evolves_from_species_id && sp.evolves_from_species_id !== ''
      ? parseInt(sp.evolves_from_species_id) : null;

    if (evolvesFrom) {
      const parent = speciesMap.get(evolvesFrom);
      if (parent && parent.evolves_from_species_id && parent.evolves_from_species_id !== '') {
        stage = 3;
      } else {
        stage = 2;
      }
    }

    const chainId = parseInt(sp.evolution_chain_id) || 0;

    result.push({
      id,
      name: sp.identifier,
      types: typeArr.filter(Boolean),
      stats: statsObj,
      bst: Object.values(statsObj).reduce((a, b) => a + b, 0),
      generation: parseInt(sp.generation_id),
      evolutionChainId: chainId,
      evolvesFrom,
      evolutionStage: stage,
      evolutionLevel: evoLevelMap.get(id) || null,
      isLegendary: sp.is_legendary === '1',
      isMythical: sp.is_mythical === '1',
      captureRate: parseInt(sp.capture_rate) || 45,
      growthRate: GROWTH_MAP[parseInt(sp.growth_rate_id)] || 'medium',
      isBaby: sp.is_baby === '1',
      sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
      archetypes: [],
    });
  }

  result.sort((a, b) => a.id - b.id);

  const outPath = path.resolve(__dirname, '..', 'src', 'data', 'pokemon.json');
  fs.writeFileSync(outPath, JSON.stringify(result));
  console.log(`Wrote ${result.length} Pokemon to ${outPath}`);
  console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
