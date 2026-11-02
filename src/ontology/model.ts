import type {
  AbilityId, AppId, ColorId, DecisionId, EggGroupId, FormId, GameId, RegionId, ShapeId, SpeciesId, SpriteStem, TypeId,
  VarietyValueId,
} from './ids';

export type Sex = 'male' | 'female';
export type Types = readonly [TypeId] | readonly [TypeId, TypeId];
export interface BaseStats {
  readonly hp: number; readonly atk: number; readonly def: number;
  readonly spe: number; readonly spa: number; readonly spd: number;
}
export interface Abilities {
  readonly first: AbilityId;
  readonly second?: AbilityId;
  readonly hidden?: AbilityId;
}
export type Shiny = 'available' | { readonly locked: string };
export type Variety = { readonly [axis: string]: VarietyValueId };
export interface LocalizedText { readonly en: string; readonly [locale: string]: string }
export type FemaleEighths = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type GenderRatio = { readonly kind: 'genderless' } | { readonly kind: 'ratio'; readonly femaleEighths: FemaleEighths };

export interface Coordinates {
  readonly region: RegionId | null;
  readonly variety: Variety;
  readonly sex: Sex | null;
  readonly fusion: SpeciesId | null;
}

export type TeraType = TypeId | 'stellar';
export type StateTrigger = { readonly ability: AbilityId };
export type FormState =
  | { readonly kind: 'mega'; readonly letter?: 'x' | 'y' | 'z' }
  | { readonly kind: 'primal' }
  | { readonly kind: 'gigantamax' }
  | { readonly kind: 'eternamax' }
  | { readonly kind: 'ultra-burst' }
  | { readonly kind: 'terastal'; readonly teraType: TeraType }
  | { readonly kind: 'battle-mode'; readonly trigger?: StateTrigger }
  | { readonly kind: 'move-look' }
  | { readonly kind: 'ride' };
export type StateKind = FormState['kind'];
export type Persistence = 'permanent' | 'battle' | 'field';

export type Obtain = 'standard' | 'event-only' | 'story-only' | 'spinoff-only' | 'unobtainable';

export interface FormFacts {
  readonly types: Types;
  readonly abilities: Abilities;
  readonly baseStats: BaseStats;
  // platform: The games store height in decimeters and show a Gigantamax height as a lower bound, such as "24.0+ m".
  readonly heightDm: number;
  // platform: The games store weight in hectograms and show "????.? kg" for Gigantamax and Eternamax forms, so their weight is null.
  readonly weightHg: number | null;
  readonly color: ColorId;
  readonly shape: ShapeId;
  readonly eggGroups: readonly EggGroupId[];
  readonly debut: GameId;
  readonly obtain: Obtain;
  readonly shiny: Shiny;
}
export type FactKey = keyof FormFacts;
export const FACT_KEYS = ['types', 'abilities', 'baseStats', 'heightDm', 'weightHg', 'color', 'shape', 'eggGroups', 'debut', 'obtain', 'shiny'] as const satisfies readonly FactKey[];
export const MECHANICAL_FACT_KEYS = ['types', 'abilities', 'baseStats', 'heightDm', 'weightHg', 'eggGroups'] as const satisfies readonly FactKey[];

export const TOOLS = ['picker', 'dex', 'league'] as const;
export type ToolId = (typeof TOOLS)[number];
export type OutReason = 'battle-state' | 'spinoff-only' | 'look-only' | { readonly decision: DecisionId } | { readonly mergedInto: FormId };
export type ToolVerdict = 'in' | { readonly out: OutReason };
export type ToolInclusion = { readonly [T in ToolId]: ToolVerdict };

export type LegendaryClass = 'none' | 'sub-legendary' | 'restricted' | 'mythical' | 'ultra-beast';

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
  readonly lookOnly: boolean;
}

export interface ResolvedEvolution {
  readonly from: FormId;
  readonly to: FormId;
  readonly level: number | null;
}

export interface ResolvedForm {
  readonly id: FormId;
  readonly appId: AppId;
  readonly species: SpeciesId;
  readonly nationalDex: number;
  readonly isDefault: boolean;
  readonly base: FormId | null;
  readonly coordinates: Coordinates;
  readonly states: readonly FormState[];
  readonly enteredFrom: readonly FormId[];
  readonly canBecome: readonly FormId[];
  readonly persistence: Persistence;
  readonly facts: FormFacts;
  readonly bst: number;
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
  readonly genderRatio: GenderRatio;
  readonly hatchCycles: number;
  readonly baseFriendship: number;
  readonly genus: LocalizedText;
  readonly legendaryClass: LegendaryClass;
  readonly tags: readonly string[];
  readonly standIn: { readonly [T in ToolId]?: FormId };
}
