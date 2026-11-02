// keeps: the phase 1 parity gate of docs/data-model/pokemon-ontology.md, which no E2E test can reach: the
// Favorite Picker and League catalogs must return the same records when rebuilt from data/ontology/.
// It runs under vitest because the League catalog imports src/i18n, which needs Vite's import.meta.glob.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import dexCatalog from '../../src/data/pokemon.json';
import { allPickerMons } from '../../src/favorites/model/catalog';
import { pickerPokemonMetadata } from '../../src/favorites/model/metadata';
import { getAllPokemon as leagueCatalog } from '../../src/league/data/catalog';
import { buildOntology } from './build';
import { inLeague, leagueRows } from './projections/legacy-league';
import { pickerId, pickerMetadata, pickerRecords } from './projections/legacy-picker';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const built = buildOntology(root);
if (!built.ok) throw new Error(built.problems.map((problem) => `${problem.file} ${problem.path}: ${problem.message}`).join('\n'));
const ontology = built.ontology;

function differences<T extends { id: number }>(label: string, expected: readonly T[], actual: readonly T[]): string[] {
  const byId = new Map(actual.map((record) => [record.id, record]));
  const problems: string[] = [];
  for (const record of expected) {
    const other = byId.get(record.id);
    if (!other) {
      problems.push(`${label} ${record.id}: missing from the ontology`);
      continue;
    }
    for (const key of new Set([...Object.keys(record), ...Object.keys(other)])) {
      const left = JSON.stringify((record as Record<string, unknown>)[key]);
      const right = JSON.stringify((other as Record<string, unknown>)[key]);
      if (left !== right) problems.push(`${label} ${record.id} ${key}: today ${left}, ontology ${right}`);
    }
  }
  for (const record of actual) if (!expected.some((other) => other.id === record.id)) problems.push(`${label} ${record.id}: not in today's catalog`);
  return problems;
}

describe('ontology parity with today’s catalogs', () => {
  it('rebuilds every Favorite Picker record', () => {
    const today = allPickerMons();
    const rebuilt = pickerRecords(ontology);
    expect(rebuilt).toHaveLength(today.length);
    expect(differences('picker', today, rebuilt)).toEqual([]);
    expect(today.length).toBe(1427);
  });

  it('rebuilds every Favorite Picker metadata record', () => {
    // usePokemonData.ts writes the app's archetype lists onto the shared pokemon.json rows when the
    // League catalog loads, so the metadata records carry them here. Archetypes are app data, not ontology.
    const today = allPickerMons().map((mon) => pickerPokemonMetadata(mon)!).map(({ archetypes: _archetypes, ...record }) => record);
    const byPickerId = new Map([...ontology.forms.values()].map((form) => [pickerId(ontology, form), form]));
    const rebuilt = today.map((record) => pickerMetadata(ontology, byPickerId.get(record.id)!)).map(({ archetypes: _archetypes, ...record }) => record);
    expect(differences('picker metadata', today, rebuilt)).toEqual([]);
    expect(today).toHaveLength(1427);
  });

  it('rebuilds every League catalog row', () => {
    const today = leagueCatalog().map(({ archetypes: _archetypes, ...row }) => row);
    const rebuilt = leagueRows(ontology);
    expect(rebuilt).toHaveLength(today.length);
    expect(differences('league', today, rebuilt)).toEqual([]);
    expect(today.length).toBe(1210);
  });

  it('gives every form the verdicts the tools apply today', () => {
    const picker = new Set(allPickerMons().map((mon) => mon.id));
    const league = new Set(leagueCatalog().map((row) => row.id));
    const dex = new Set(dexCatalog.map((row) => row.id));
    for (const form of ontology.forms.values()) {
      expect(form.tools.picker === 'in', `${form.id} picker`).toBe(picker.has(pickerId(ontology, form)));
      expect(form.tools.dex === 'in', `${form.id} dex`).toBe(dex.has(form.appId));
      expect(inLeague(form), `${form.id} league row`).toBe(league.has(form.appId));
    }
  });
});
