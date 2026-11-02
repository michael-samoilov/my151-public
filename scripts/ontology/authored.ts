/**
 * The JSON shapes a person or the importer writes under data/ontology/. On disk every id is a plain
 * string; scripts/ontology/load.ts brands it after it has checked the reference.
 */
import type { DataSourceId, DecisionId, FormId, GameId, RegionId, SpeciesId, SpriteStem, VarietyAxisId, VarietyValueId } from '../../src/ontology/ids';
import type { FactKey, FormFacts, FormState, LegendaryClass, Sex, ToolId, ToolInclusion, Variety } from '../../src/ontology/model';

export interface Sourced<K extends string> {
  /** Where this record came from. Defaults to the file's source. */
  readonly source?: DataSourceId;
  /** A field whose value came from another source than the record. */
  readonly sourceOf?: { readonly [F in K]?: DataSourceId };
}

/** One file per species: data/ontology/species/<dex4>-<species>.json. forms[0] is the default form. */
export interface SpeciesFile {
  readonly source: DataSourceId;
  readonly species: SpeciesEntry;
  readonly forms: readonly [DefaultFormEntry, ...FormEntry[]];
  /** Evolutions into this species, so a species file is self-contained. The first edge into a form is its primary edge. */
  readonly evolutions: readonly EvolutionEntry[];
}

export interface SpeciesEntry {
  readonly id: SpeciesId;
  readonly nationalDex: number;
  readonly captureRate: number;
  readonly growthRate: string;
  readonly legendaryClass: LegendaryClass;
  readonly tags: readonly string[];
  /** The axes this species' forms vary on, with the values in display order. */
  readonly varietyAxes: readonly { readonly axis: VarietyAxisId; readonly values: readonly VarietyValueId[] }[];
  /** A tool shows another form's sprite for the default form, such as Wishiwashi School in the Dex. */
  readonly standIn: { readonly [T in ToolId]?: FormId };
}

interface FormEntryBase extends Sourced<FactKey | 'tools' | 'sprite'> {
  readonly id: FormId;
  readonly sprite: SpriteStem;
  readonly externalIds?: { readonly pokeapiForm?: string };
}

export interface CoordinatesEntry {
  readonly region?: RegionId;
  readonly variety?: Variety;
  readonly sex?: Sex;
  readonly fusion?: SpeciesId;
}

export type CoreFact = Exclude<FactKey, 'obtain'>;

/** The default form states every core fact. It is in every tool unless it says otherwise. */
export type DefaultFormEntry = FormEntryBase & CoordinatesEntry & Pick<FormFacts, CoreFact> &
  Partial<Pick<FormFacts, 'obtain'>> & { readonly state?: never; readonly tools?: ToolInclusion };

/** A permanent non-default form: coordinates, sparse facts, explicit tool verdicts. Inherits from forms[0]. */
export type PermanentFormEntry = FormEntryBase & CoordinatesEntry & Partial<FormFacts> &
  { readonly state?: never; readonly tools: ToolInclusion };

export type StateEntry = FormState & {
  /** The forms of this species that enter the state. 'any' means every permanent form. */
  readonly from: readonly [FormId, ...FormId[]] | 'any';
};

/** A temporary form: one state step and the forms that enter it. It inherits from from[0], or from forms[0] when from is 'any'. */
export type StateFormEntry = FormEntryBase & { readonly [K in keyof CoordinatesEntry]?: never } & Partial<FormFacts> &
  { readonly state: StateEntry; readonly tools: ToolInclusion };

export type FormEntry = PermanentFormEntry | StateFormEntry;

export interface EvolutionEntry extends Sourced<'methods'> {
  readonly from: FormId;
  readonly to: FormId;
  /** Empty when today's data records no method. Later phases import methods from PokeAPI. */
  readonly methods: readonly EvolutionMethod[];
}

export interface EvolutionMethod {
  readonly games: 'all';
  readonly trigger: 'level-up';
  readonly conditions: readonly { readonly kind: 'level'; readonly level: number }[];
}

/** ids/app-ids.json. Append-only. Rows are sorted by number, so two branches that mint one number conflict in git. */
export interface AppIdLedger {
  readonly rows: readonly (readonly [number, FormId])[];
  /** Numbers no live form uses that must never be assigned again. */
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

export interface DataSourceEntry {
  readonly id: DataSourceId;
  readonly kind: 'legacy-file';
  readonly ref: string;
}

/** legacy/picker.json: what today's Favorite Picker records hold that the ontology does not derive. */
export interface LegacyPicker {
  /** Picker numbers that differ from the AppId. The saved-data migration of phase 2 reads this. */
  readonly ids: { readonly [form: string]: number };
  /** The Picker's `name` string where it is not the form id: power-up labels and Urshifu. */
  readonly names: { readonly [form: string]: string };
  /** The Picker's `ownerId` where no rule gives it. */
  readonly owners: { readonly [form: string]: FormId };
}

/** legacy/dex.json: what src/data/pokemon.json holds that the ontology does not derive. */
export interface LegacyDex {
  /** Where each non-default form's row sits: after the named row. Alcremie's sweets follow Alcremie; most regional forms follow the last species. */
  readonly formOrder: readonly { readonly form: FormId; readonly after: FormId }[];
  /** A species whose Dex stand-in is served from a second copy of the stand-in form's sprite file. */
  readonly standInSprites: { readonly [species: string]: string };
}

export interface AuthoredOntology {
  readonly species: readonly { readonly file: string; readonly data: SpeciesFile }[];
  readonly appIds: AppIdLedger;
  readonly games: readonly GameEntry[];
  readonly regions: readonly string[];
  readonly varietyAxes: readonly string[];
  readonly vocab: { readonly [kind in 'types' | 'colors' | 'shapes' | 'eggGroups' | 'growthRates' | 'speciesTags']: readonly string[] };
  readonly decisions: readonly DecisionEntry[];
  readonly sources: readonly DataSourceEntry[];
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
