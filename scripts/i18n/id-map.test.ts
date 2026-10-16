import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID_MAP_FIXTURE_PATH, type IdMapFixture } from './build-id-map-fixture';
import type { IdMapEntry } from './propose-id-map';

/**
 * 13 of the app's alt-form ids belong to a different creature in PokeAPI —
 * app 10254 is Alcremie Berry Sweet, upstream 10254 is Oinkologne Female. A
 * naive join would label six Alcremie forms as Gen 9 Pokémon in eight
 * languages, and nothing in English would ever show it, because English names
 * come from the app's own slug.
 */

interface AppPokemon { id: number; name: string }

const app: AppPokemon[] = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8'));
const { entries } = JSON.parse(readFileSync('scripts/i18n/pokemon-id-map.json', 'utf8')) as {
  entries: IdMapEntry[];
};
const byAppId = new Map(entries.map((e) => [e.appId, e]));

const fixture: IdMapFixture = JSON.parse(readFileSync(ID_MAP_FIXTURE_PATH, 'utf8'));

const upstreamForms = new Set(fixture.forms);
const upstreamSpecies = new Map(
  Object.entries(fixture.species).map(([id, s]) => [Number(id), s.identifier]),
);
const speciesNames = new Map(
  Object.entries(fixture.species).map(([id, s]) => [Number(id), s.en]),
);

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

describe('pokemon id map', () => {
  it('covers every Pokémon in the dataset', () => {
    const missing = app.filter((p) => !byAppId.has(p.id)).map((p) => `${p.id} ${p.name}`);
    expect(missing, 'run `npm run i18n:propose-map`').toEqual([]);
  });

  it('records the app name alongside the id, and both still agree', () => {
    const drifted = app
      .filter((p) => byAppId.get(p.id)!.appName !== p.name)
      .map((p) => `${p.id}: data says "${p.name}", map says "${byAppId.get(p.id)!.appName}"`);
    expect(drifted).toEqual([]);
  });

  it('points every entry at a form and species that exist upstream', () => {
    const broken = entries
      .filter((e) => !upstreamForms.has(e.formId) || !upstreamSpecies.has(e.speciesId))
      .map((e) => `${e.appId} ${e.appName} -> species ${e.speciesId}, form ${e.formId}`);
    expect(broken).toEqual([]);
  });

  it('maps each app id to a distinct form', () => {
    const seen = new Map<number, string>();
    const collisions: string[] = [];
    for (const e of entries) {
      const prev = seen.get(e.formId);
      if (prev) collisions.push(`${e.appName} and ${prev} both -> form ${e.formId}`);
      else seen.set(e.formId, e.appName);
    }
    expect(collisions).toEqual([]);
  });

  it('resolves to a species whose English name matches the app slug', () => {
    const wrong = entries
      .filter((e) => {
        const species = speciesNames.get(e.speciesId);
        return !species || !norm(e.appName).startsWith(norm(species));
      })
      .map((e) => `${e.appId} ${e.appName} -> ${speciesNames.get(e.speciesId) ?? '?'}`);
    expect(wrong).toEqual([]);
  });
});
