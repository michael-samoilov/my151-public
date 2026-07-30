import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID_MAP_FIXTURE_PATH, type IdMapFixture } from './build-id-map-fixture';
import type { IdMapEntry } from './propose-id-map';

/**
 * Guards the id map, which is the load-bearing piece of Pokémon localisation.
 *
 * 13 of the app's alt-form ids belong to a different creature in PokeAPI —
 * app 10254 is Alcremie Berry Sweet, upstream 10254 is Oinkologne Female. A
 * naive join would label six Alcremie forms as Gen 9 Pokémon in eight
 * languages, and nothing in English would ever show it, because English names
 * come from the app's own slug.
 *
 * These checks are what make that impossible to reintroduce.
 *
 * The upstream side comes from `id-map-fixture.json`, not from the PokeAPI
 * cache. The cache is gitignored — the pin against upstream drift is the
 * committed output, not 21k lines of raw dump in every review — so reading it
 * here meant the test passed on any machine that had run a generator and failed
 * on every clean checkout, which is to say it failed in CI continuously while
 * looking green locally. `npm run i18n:fixture` regenerates the fixture from
 * live upstream, and that is when these assertions are re-checked against it.
 */

interface AppPokemon { id: number; name: string }

const app: AppPokemon[] = JSON.parse(readFileSync('src/data/pokemon.json', 'utf8'));
const { entries } = JSON.parse(readFileSync('scripts/i18n/pokemon-id-map.json', 'utf8')) as {
  entries: IdMapEntry[];
};
const byAppId = new Map(entries.map((e) => [e.appId, e]));

const fixture: IdMapFixture = JSON.parse(readFileSync(ID_MAP_FIXTURE_PATH, 'utf8'));

const upstreamPokemon = new Map(
  Object.entries(fixture.pokemon).map(([id, r]) => [Number(id), r]),
);
const upstreamForms = new Set(fixture.forms);
const upstreamSpecies = new Map(
  Object.entries(fixture.species).map(([id, s]) => [Number(id), s.identifier]),
);
const speciesNames = new Map(
  Object.entries(fixture.species).map(([id, s]) => [Number(id), s.en]),
);

/**
 * Compare slugs and display names without punctuation getting in the way:
 * "Farfetch'd"/"farfetchd", "Mr. Mime"/"mr-mime", "Nidoran♀"/"nidoran-f".
 *
 * Diacritics are folded rather than stripped — decomposing first turns
 * "Flabébé" into "flabebe" to match the slug, where dropping non-ASCII outright
 * would leave "flabb" and fail.
 */
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

  it('has no leftover entries for Pokémon the dataset dropped', () => {
    const appIds = new Set(app.map((p) => p.id));
    expect(entries.filter((e) => !appIds.has(e.appId)).map((e) => e.appName)).toEqual([]);
  });

  it('records the app name alongside the id, and both still agree', () => {
    // Drift in either direction is detectable because both are recorded.
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
    // Two app entries resolving to one upstream form would render as duplicates.
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
    // The check that catches "stunfisk-galar mapped to Yamask". A structural
    // check cannot: both are valid ids pointing at real rows.
    const wrong = entries
      .filter((e) => {
        const species = speciesNames.get(e.speciesId);
        return !species || !norm(e.appName).startsWith(norm(species));
      })
      .map((e) => `${e.appId} ${e.appName} -> ${speciesNames.get(e.speciesId) ?? '?'}`);
    expect(wrong).toEqual([]);
  });

  it('flags every entry whose id disagrees with PokeAPI, and only those', () => {
    // The anti-naive-join tripwire. If a future dataset change makes an id
    // collide, its missing note fails here rather than silently mislabelling.
    const shouldHaveNote = entries.filter(
      (e) => upstreamPokemon.get(e.appId)?.identifier !== undefined
        && upstreamPokemon.get(e.appId)!.identifier !== e.appName
        && upstreamSpecies.get(upstreamPokemon.get(e.appId)!.speciesId) !== e.appName,
    );
    const undocumented = shouldHaveNote.filter((e) => !e.note).map((e) => `${e.appId} ${e.appName}`);
    expect(undocumented, 'id collides upstream but the map does not say so').toEqual([]);
  });

  it('never needs review in a committed map', () => {
    expect(entries.filter((e) => e.needsReview).map((e) => e.appName)).toEqual([]);
  });

  it('resolves the known collisions to the right creature', () => {
    // Hand-asserted: these are exactly the entries a naive join gets wrong.
    const expected: Record<number, string> = {
      10254: 'Alcremie', // upstream id 10254 is Oinkologne
      10255: 'Alcremie', // Dudunsparce
      10256: 'Alcremie', // Palafin
      10257: 'Alcremie', // Maushold
      10258: 'Alcremie', // Tatsugiri
      10259: 'Alcremie', // Tatsugiri
      10227: 'Urshifu',
      10177: 'Darmanitan',
      10178: 'Yamask', // upstream id 10178 is Darmanitan Galar Zen
      10179: 'Stunfisk', // upstream id 10179 is Yamask Galar
      10250: 'Tauros',
      10251: 'Tauros',
      10252: 'Tauros',
    };
    for (const [id, species] of Object.entries(expected)) {
      const entry = byAppId.get(Number(id));
      expect(speciesNames.get(entry!.speciesId), `${entry!.appName}`).toBe(species);
    }
  });
});
