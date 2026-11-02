export interface PokeapiSpeciesRow {
  readonly id: number;
  readonly identifier: string;
  readonly generation: number;
  readonly chain: number;
  readonly color: string;
  readonly shape: string;
  readonly eggGroups: readonly string[];
  // platform: PokeAPI encodes genderRate as -1 for genderless, else as the female share in eighths.
  readonly genderRate: number;
  readonly captureRate: number;
  readonly baseHappiness: number;
  readonly hatchCounter: number;
  readonly growthRate: string;
  readonly isBaby: boolean;
  readonly isLegendary: boolean;
  readonly isMythical: boolean;
  readonly hasGenderDifferences: boolean;
  readonly genus: string;
}

export interface PokeapiAbilities {
  readonly first?: string;
  readonly second?: string;
  readonly hidden?: string;
}

export interface PokeapiPokemonRow {
  readonly id: number;
  readonly identifier: string;
  readonly species: string;
  readonly isDefault: boolean;
  readonly height: number;
  readonly weight: number;
  readonly types: readonly string[];
  readonly stats: { readonly hp: number; readonly atk: number; readonly def: number; readonly spa: number; readonly spd: number; readonly spe: number };
  // platform: PokeAPI has no abilities for the nine Legends: Z-A Megas at this commit, so this is empty for them.
  readonly abilities: PokeapiAbilities;
}

export interface PokeapiFormRow {
  readonly id: number;
  readonly identifier: string;
  readonly pokemon: string;
  readonly isDefault: boolean;
  readonly isBattleOnly: boolean;
  readonly isMega: boolean;
  readonly versionGroup: string;
}

export interface PokeapiExtract {
  readonly repository: string;
  readonly commit: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
  readonly abilities: readonly string[];
  readonly species: { readonly [identifier: string]: PokeapiSpeciesRow };
  readonly pokemon: { readonly [identifier: string]: PokeapiPokemonRow };
  readonly forms: { readonly [identifier: string]: PokeapiFormRow };
}

export const GROWTH_RATE_OF_POKEAPI: Readonly<Record<string, string>> = {
  'slow-then-very-fast': 'erratic',
  'fast-then-very-slow': 'fluctuating',
};
export const appGrowthRate = (pokeapi: string): string => GROWTH_RATE_OF_POKEAPI[pokeapi] ?? pokeapi;

export const pokeapiSourceId = (commit: string): string => `pokeapi@${commit.slice(0, 8)}`;
export const pokeapiExtractPath = (commit: string): string => `data/ontology/sources/pokeapi-${commit.slice(0, 8)}.json`;

export type PokeapiIdentity =
  | { readonly kind: 'form'; readonly form: PokeapiFormRow; readonly pokemon: PokeapiPokemonRow; readonly species: PokeapiSpeciesRow }
  | { readonly kind: 'pokemon'; readonly pokemon: PokeapiPokemonRow; readonly species: PokeapiSpeciesRow }
  | { readonly kind: 'none' };

export interface ExternalIds {
  readonly pokeapiForm?: string;
  readonly pokeapiPokemon?: string;
}

// platform: PokeAPI keeps a cosmetic female on its species' pokemon record with no form of its own, so externalIds names that pokemon.
export function pokeapiIdentityOf(formId: string, externalIds: ExternalIds | undefined, extract: PokeapiExtract): PokeapiIdentity | { readonly error: string } {
  const formIdentifier = externalIds?.pokeapiForm ?? (externalIds?.pokeapiPokemon ? null : formId);
  if (externalIds?.pokeapiPokemon) {
    const pokemon = extract.pokemon[externalIds.pokeapiPokemon];
    if (!pokemon) return { error: `pokeapiPokemon "${externalIds.pokeapiPokemon}" is not a pokemon in ${pokeapiExtractPath(extract.commit)}` };
    return { kind: 'pokemon', pokemon, species: extract.species[pokemon.species] };
  }
  const form = formIdentifier === null ? undefined : extract.forms[formIdentifier];
  if (!form) {
    if (externalIds?.pokeapiForm) return { error: `pokeapiForm "${externalIds.pokeapiForm}" is not a form in ${pokeapiExtractPath(extract.commit)}` };
    return { kind: 'none' };
  }
  const pokemon = extract.pokemon[form.pokemon];
  return { kind: 'form', form, pokemon, species: extract.species[pokemon.species] };
}
