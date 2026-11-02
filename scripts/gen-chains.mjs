#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8'));
const chains = Object.fromEntries(data.map((p) => [p.id, p.evolutionChainId]));
writeFileSync('api/_chains.ts', `export const EVOLUTION_CHAIN_BY_ID: Record<number, number> = ${JSON.stringify(chains)};\n`);
console.log(`api/_chains.ts: ${Object.keys(chains).length} ids`);
