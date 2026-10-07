#!/usr/bin/env node
/**
 * Regenerates api/_chains.ts from src/data/pokemon.json. The analytics API
 * reads it to count evolution lines, and /api/submit accepts exactly its ids,
 * so a stale table drops Pokédex beacons. src/lib/dexIds.test.ts fails when
 * the table and the data differ.
 *
 * Usage: node scripts/gen-chains.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8'));
const chains = Object.fromEntries(data.map((p) => [p.id, p.evolutionChainId]));
const header = [
  '// AUTO-GENERATED from src/data/pokemon.json — id -> evolutionChainId.',
  '// Lets the analytics API count distinct evolution lines from a set of ids',
  '// (server has no access to the full Pokemon dataset). Regenerate if the',
  '// dataset changes: node scripts/gen-chains.mjs',
];
writeFileSync('api/_chains.ts', `${header.join('\n')}\nexport const EVOLUTION_CHAIN_BY_ID: Record<number, number> = ${JSON.stringify(chains)};\n`);
console.log(`api/_chains.ts: ${Object.keys(chains).length} ids`);
