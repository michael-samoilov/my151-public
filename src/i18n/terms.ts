import {
  TYPE_NAMES,
  type ColorName,
  type EggGroupName,
  type ShapeName,
  type TypeName,
} from '@/types/pokemon';
import { translate } from './core';
import type { MessageKey } from './types';

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

export function typeLabels(): string[] {
  return TYPE_NAMES.map(typeLabel);
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
