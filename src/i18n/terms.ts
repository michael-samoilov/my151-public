import type {
  ColorName,
  EggGroupName,
  ShapeName,
  TypeName,
} from '@/types/pokemon';
import { translate } from './core';
import type { MessageKey } from './types';

/**
 * In-game terminology: types, Pokédex colours, egg groups and body shapes.
 *
 * These are keyed by exhaustive `Record`s rather than by string concatenation,
 * so adding a type or shape to `src/types/pokemon.ts` without adding its
 * message is a compile error rather than a `term.type.stellar` rendered to a
 * user. That exhaustiveness is the whole reason this file exists instead of a
 * one-line `t(\`term.type.\${type}\`)` helper.
 *
 * Every one of these has an official published translation in all nine target
 * languages (PokeAPI's `type_names`, `pokemon_color_names`, `egg_group_prose`),
 * with one exception: `pokemon_shape_prose` carries only English and French, so
 * the shape labels are the only terms here that will need translating rather
 * than sourcing.
 */

const TYPE_KEYS = {
  normal: 'term.type.normal',
  fire: 'term.type.fire',
  water: 'term.type.water',
  electric: 'term.type.electric',
  grass: 'term.type.grass',
  ice: 'term.type.ice',
  fighting: 'term.type.fighting',
  poison: 'term.type.poison',
  ground: 'term.type.ground',
  flying: 'term.type.flying',
  psychic: 'term.type.psychic',
  bug: 'term.type.bug',
  rock: 'term.type.rock',
  ghost: 'term.type.ghost',
  dragon: 'term.type.dragon',
  dark: 'term.type.dark',
  steel: 'term.type.steel',
  fairy: 'term.type.fairy',
} as const satisfies Record<TypeName, MessageKey>;

const COLOR_KEYS = {
  black: 'term.color.black',
  blue: 'term.color.blue',
  brown: 'term.color.brown',
  gray: 'term.color.gray',
  green: 'term.color.green',
  pink: 'term.color.pink',
  purple: 'term.color.purple',
  red: 'term.color.red',
  white: 'term.color.white',
  yellow: 'term.color.yellow',
} as const satisfies Record<ColorName, MessageKey>;

const EGG_GROUP_KEYS = {
  monster: 'term.eggGroup.monster',
  water1: 'term.eggGroup.water1',
  water2: 'term.eggGroup.water2',
  water3: 'term.eggGroup.water3',
  bug: 'term.eggGroup.bug',
  flying: 'term.eggGroup.flying',
  ground: 'term.eggGroup.ground',
  fairy: 'term.eggGroup.fairy',
  plant: 'term.eggGroup.plant',
  humanshape: 'term.eggGroup.humanshape',
  mineral: 'term.eggGroup.mineral',
  indeterminate: 'term.eggGroup.indeterminate',
  ditto: 'term.eggGroup.ditto',
  dragon: 'term.eggGroup.dragon',
  'no-eggs': 'term.eggGroup.no-eggs',
} as const satisfies Record<EggGroupName, MessageKey>;

const SHAPE_KEYS = {
  ball: 'term.shape.ball',
  squiggle: 'term.shape.squiggle',
  fish: 'term.shape.fish',
  arms: 'term.shape.arms',
  blob: 'term.shape.blob',
  upright: 'term.shape.upright',
  legs: 'term.shape.legs',
  quadruped: 'term.shape.quadruped',
  wings: 'term.shape.wings',
  tentacles: 'term.shape.tentacles',
  heads: 'term.shape.heads',
  humanoid: 'term.shape.humanoid',
  'bug-wings': 'term.shape.bug-wings',
  armor: 'term.shape.armor',
} as const satisfies Record<ShapeName, MessageKey>;

export function typeLabel(type: TypeName): string {
  return translate(TYPE_KEYS[type]);
}

export function colorLabel(color: ColorName): string {
  return translate(COLOR_KEYS[color]);
}

export function eggGroupLabel(group: EggGroupName): string {
  return translate(EGG_GROUP_KEYS[group]);
}

export function shapeLabel(shape: ShapeName): string {
  return translate(SHAPE_KEYS[shape]);
}
