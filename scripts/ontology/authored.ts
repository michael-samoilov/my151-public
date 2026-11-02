import type { DataSourceId, DecisionId, FormId, GameId, RegionId, SpeciesId, SpriteStem, VarietyAxisId, VarietyValueId } from '../../src/ontology/ids';
import type { FactKey, FormFacts, FormState, GenderRatio, LegendaryClass, LocalizedText, Sex, ToolId, ToolInclusion, Variety } from '../../src/ontology/model';
import type { ExternalIds, PokeapiExtract } from './pokeapi/source';

export const INHERITED_UNSOURCED = 'inherited:unsourced';

export interface Sourced<K extends string> {
  readonly source?: DataSourceId;
  readonly sourceOf?: { readonly [F in K]?: DataSourceId };
}

export interface SpeciesFile {
  readonly source: DataSourceId;
  readonly species: SpeciesEntry;
  readonly forms: readonly [DefaultFormEntry, ...FormEntry[]];
  readonly evolutions: readonly EvolutionEntry[];
}

export type SpeciesFactKey = 'captureRate' | 'growthRate' | 'genderRatio' | 'hatchCycles' | 'baseFriendship' | 'genus';

export interface SpeciesEntry extends Sourced<SpeciesFactKey> {
  readonly id: SpeciesId;
  readonly nationalDex: number;
  readonly captureRate: number;
  readonly growthRate: string;
  readonly genderRatio: GenderRatio;
  readonly hatchCycles: number;
  readonly baseFriendship: number;
  readonly genus: LocalizedText;
  readonly legendaryClass: LegendaryClass;
  readonly tags: readonly string[];
  readonly varietyAxes: readonly { readonly axis: VarietyAxisId; readonly values: readonly VarietyValueId[] }[];
  readonly standIn: { readonly [T in ToolId]?: FormId };
}

interface FormEntryBase extends Sourced<FactKey | 'tools' | 'sprite'> {
  readonly id: FormId;
  readonly sprite: SpriteStem;
  readonly externalIds?: ExternalIds;
}

export interface CoordinatesEntry {
  readonly region?: RegionId;
  readonly variety?: Variety;
  readonly sex?: Sex;
  readonly fusion?: SpeciesId;
}

export type CoreFact = Exclude<FactKey, 'obtain' | 'shiny'>;

export type DefaultFormEntry = FormEntryBase & CoordinatesEntry & Pick<FormFacts, CoreFact> &
  Partial<Pick<FormFacts, 'obtain' | 'shiny'>> & { readonly state?: never; readonly tools?: ToolInclusion };

export type PermanentFormEntry = FormEntryBase & CoordinatesEntry & Partial<FormFacts> &
  { readonly state?: never; readonly tools: ToolInclusion };

export type StateEntry = FormState & {
  readonly from: readonly [FormId, ...FormId[]] | 'any';
};

export type StateFormEntry = FormEntryBase & { readonly [K in keyof CoordinatesEntry]?: never } & Partial<FormFacts> &
  { readonly state: StateEntry; readonly tools: ToolInclusion };

export type FormEntry = PermanentFormEntry | StateFormEntry;

export interface EvolutionEntry extends Sourced<'methods'> {
  readonly from: FormId;
  readonly to: FormId;
  readonly methods: readonly EvolutionMethod[];
}

export interface EvolutionMethod {
  readonly games: 'all';
  readonly trigger: 'level-up';
  readonly conditions: readonly { readonly kind: 'level'; readonly level: number }[];
}

export interface AppIdLedger {
  readonly rows: readonly (readonly [number, FormId])[];
  readonly retired: readonly { readonly id: number; readonly meant: string; readonly why: string }[];
}

export interface GameEntry {
  readonly id: GameId;
  readonly series: 'mainline' | 'spinoff' | 'mobile';
  readonly generation: number | null;
  readonly region: RegionId | null;
}

export interface DecisionEntry {
  readonly id: DecisionId;
  readonly by: string;
  readonly date: string;
  readonly quote: string;
  readonly where: string;
}

export type DataSourceEntry =
  | { readonly id: DataSourceId; readonly kind: 'legacy-file'; readonly ref: string }
  | { readonly id: DataSourceId; readonly kind: 'pokeapi-csv'; readonly repository: string; readonly commit: string; readonly extract: string }
  | { readonly id: DataSourceId; readonly kind: 'inheritance'; readonly note: string }
  | { readonly id: DataSourceId; readonly kind: 'statement'; readonly by: string; readonly date: string; readonly quote: string; readonly where: string };

export interface LegacyPicker {
  readonly ids: { readonly [form: string]: number };
  readonly names: { readonly [form: string]: string };
  readonly owners: { readonly [form: string]: FormId };
}

export interface LegacyDex {
  readonly formOrder: readonly { readonly form: FormId; readonly after: FormId }[];
  readonly standInSprites: { readonly [species: string]: string };
}

export interface AuthoredOntology {
  readonly species: readonly { readonly file: string; readonly data: SpeciesFile }[];
  readonly appIds: AppIdLedger;
  readonly games: readonly GameEntry[];
  readonly regions: readonly string[];
  readonly varietyAxes: readonly string[];
  readonly vocab: { readonly [kind in 'types' | 'colors' | 'shapes' | 'eggGroups' | 'growthRates' | 'speciesTags' | 'abilities']: readonly string[] };
  readonly decisions: readonly DecisionEntry[];
  readonly sources: readonly DataSourceEntry[];
  readonly pokeapi: PokeapiExtract;
  readonly legacy: {
    readonly picker: LegacyPicker;
    readonly dex: LegacyDex;
    readonly evolutionChains: { readonly [species: string]: number };
  };
}

export interface Problem {
  readonly code: string;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}
