/**
 * Branded identifiers of the Pokémon ontology (docs/data-model/pokemon-ontology.md).
 * Only the loader in scripts/ontology brands a value, after it has checked the reference.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 'raichu'. The species slug, equal to the default form's id. */
export type SpeciesId = Brand<string, 'SpeciesId'>;
/** 'raichu-alola', 'unown-b', 'venusaur-mega'. The identity of one pickable Pokémon across the app. */
export type FormId = Brand<string, 'FormId'>;
/**
 * The frozen number saved data, the API, and analytics store for one form.
 * data/ontology/ids/app-ids.json owns it. A default form's number is its National Dex number;
 * every other number was a Dex number, a Picker number, or a mint from 20001 upward.
 */
export type AppId = Brand<number, 'AppId'>;
export type GameId = Brand<string, 'GameId'>; // 'scarlet-violet', 'pokopia', 'home'
export type RegionId = Brand<string, 'RegionId'>; // 'alola', 'galar', 'hisui', 'paldea'
export type VarietyAxisId = Brand<string, 'VarietyAxisId'>; // 'letter', 'pattern', 'cream', 'sweet'
export type VarietyValueId = Brand<string, 'VarietyValueId'>; // 'a', 'meadow', 'vanilla'
export type TypeId = Brand<string, 'TypeId'>;
export type ColorId = Brand<string, 'ColorId'>;
export type ShapeId = Brand<string, 'ShapeId'>;
export type EggGroupId = Brand<string, 'EggGroupId'>;
export type AbilityId = Brand<string, 'AbilityId'>; // 'overgrow', 'chlorophyll'
export type GrowthRateId = Brand<string, 'GrowthRateId'>;
export type SpeciesTagId = Brand<string, 'SpeciesTagId'>; // 'baby'
export type DecisionId = Brand<string, 'DecisionId'>;
export type DataSourceId = Brand<string, 'DataSourceId'>; // 'legacy:src/data/pokemon.json'
/** A sprite file stem under public/sprites/pokemon: '25', '10100', 'alcremie-star'. */
export type SpriteStem = Brand<string, 'SpriteStem'>;
