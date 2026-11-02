/**
 * Value types of the Pokémon ontology that app code may import: classification facets, state
 * steps, form facts, and tool verdicts. The authored JSON shapes live in scripts/ontology/authored.ts,
 * because only the build reads them.
 */
import type {
  AppId, ColorId, DecisionId, EggGroupId, FormId, GameId, RegionId, ShapeId, SpeciesId, SpriteStem, TypeId,
  VarietyValueId,
} from './ids';

export type Sex = 'male' | 'female';
export type Types = readonly [TypeId] | readonly [TypeId, TypeId];
export interface BaseStats {
  readonly hp: number; readonly atk: number; readonly def: number;
  readonly spe: number; readonly spa: number; readonly spd: number;
}
export type Variety = { readonly [axis: string]: VarietyValueId };

/**
 * Where a permanent form sits within its species. Each facet is independent and has an explicit
 * "none" (null or {}). No two permanent forms of one species share coordinates.
 */
export interface Coordinates {
  readonly region: RegionId | null;
  readonly variety: Variety;
  readonly sex: Sex | null;
  readonly fusion: SpeciesId | null;
}

export type TeraType = TypeId | 'stellar';
/**
 * One temporary transformation. Item, move, and trigger payloads arrive with the items and moves
 * phases, so each kind carries only what today's catalogs know.
 */
export type FormState =
  | { readonly kind: 'mega'; readonly letter?: 'x' | 'y' | 'z' }
  | { readonly kind: 'primal' }
  | { readonly kind: 'gigantamax' }
  | { readonly kind: 'eternamax' }
  | { readonly kind: 'ultra-burst' }
  | { readonly kind: 'terastal'; readonly teraType: TeraType }
  | { readonly kind: 'battle-mode' }
  | { readonly kind: 'move-look' }
  | { readonly kind: 'ride' };
export type StateKind = FormState['kind'];
/** Derived from the state chain: no step is permanent, a ride step alone is field, anything else is battle. */
export type Persistence = 'permanent' | 'battle' | 'field';

export type Obtain = 'standard' | 'event-only' | 'story-only' | 'spinoff-only' | 'unobtainable';

/** Every fact a form owns today. A non-default form states only what differs from its base. */
export interface FormFacts {
  readonly types: Types;
  readonly baseStats: BaseStats;
  readonly color: ColorId;
  readonly shape: ShapeId;
  readonly eggGroups: readonly EggGroupId[];
  readonly debut: GameId;
  readonly obtain: Obtain;
}
export type FactKey = keyof FormFacts;
export const FACT_KEYS = ['types', 'baseStats', 'color', 'shape', 'eggGroups', 'debut', 'obtain'] as const satisfies readonly FactKey[];

export const TOOLS = ['picker', 'dex', 'league'] as const;
export type ToolId = (typeof TOOLS)[number];
/**
 * A structural reason is a claim the checker proves on the resolved form, so a wrong reason fails
 * the build. A decision cites a record in data/ontology/decisions.json.
 */
export type OutReason = 'battle-state' | 'spinoff-only' | 'look-only' | { readonly decision: DecisionId };
export type ToolVerdict = 'in' | { readonly out: OutReason };
export type ToolInclusion = { readonly [T in ToolId]: ToolVerdict };

export type LegendaryClass = 'none' | 'sub-legendary' | 'restricted' | 'mythical' | 'ultra-beast';

/** The yes/no flags Michael asked for. The build derives them from coordinates and the state chain. */
export interface FormFlags {
  readonly regional: boolean;
  readonly variety: boolean;
  readonly sex: boolean;
  readonly fusion: boolean;
  readonly mega: boolean;
  readonly primal: boolean;
  readonly gigantamax: boolean;
  readonly eternamax: boolean;
  readonly ultraBurst: boolean;
  readonly terastal: boolean;
  readonly battleMode: boolean;
  readonly moveLook: boolean;
  readonly ride: boolean;
  readonly battleOnly: boolean;
  readonly spinoff: boolean;
  /** No fact differs from the species' default form. */
  readonly lookOnly: boolean;
}

export interface ResolvedEvolution {
  readonly from: FormId;
  readonly to: FormId;
  readonly level: number | null;
}

/** One form with every inherited fact filled in and every derived value computed. */
export interface ResolvedForm {
  readonly id: FormId;
  readonly appId: AppId;
  readonly species: SpeciesId;
  readonly nationalDex: number;
  readonly isDefault: boolean;
  /** The form this one inherits unstated facts from. Null for a default form. */
  readonly base: FormId | null;
  readonly coordinates: Coordinates;
  /** Outermost last: Terapagos Stellar is [battle-mode, terastal]. */
  readonly states: readonly FormState[];
  readonly enteredFrom: readonly FormId[];
  readonly canBecome: readonly FormId[];
  readonly persistence: Persistence;
  readonly facts: FormFacts;
  readonly bst: number;
  /** The debut game's generation, or the species generation when the game has none. */
  readonly generation: number;
  readonly is: FormFlags;
  readonly tools: ToolInclusion;
  readonly sprite: SpriteStem;
  readonly evolvesFrom: readonly ResolvedEvolution[];
  readonly evolvesTo: readonly ResolvedEvolution[];
}

export interface ResolvedSpecies {
  readonly id: SpeciesId;
  readonly nationalDex: number;
  readonly forms: readonly FormId[];
  readonly generation: number;
  readonly captureRate: number;
  readonly growthRate: string;
  readonly legendaryClass: LegendaryClass;
  readonly tags: readonly string[];
  readonly standIn: { readonly [T in ToolId]?: FormId };
}
