import pokemonData from '@/data/pokemon.json';
import {
  LEGENDARY_PARADOX_IDS,
  PARADOX_IDS,
  STARTER_IDS,
  ULTRA_BEAST_IDS,
} from '@/data/categories';
import powerupForms from '@/league/data/powerupForms.json';
import type { Pokemon, TypeName } from '@/types/pokemon';
import type { PowerupForms } from '@/league/model/powerups';
import { GEN_NUMBERS, type GenNumber } from './cells';
import { ALTERNATE_PICKER_FORMS } from './alternateForms';

export const CONVERGENT_IDS = new Set([948, 949, 960, 961]);

export type PickerSource = 'dex' | 'powerup';

export interface PickerMon {
  id: number;
  name: string;
  types: TypeName[];
  generation: GenNumber;
  sprite: string;
  source: PickerSource;
  ownerId: number;
}

const SPECIES = pokemonData as Pokemon[];
const FORMS = powerupForms as PowerupForms;

const REGIONAL_RE = /-(alola|galar|hisui|paldea)(?:-|$)/;
const SPECIES_BY_ID = new Map(SPECIES.map((p) => [p.id, p]));
const REGIONAL_FAMILY_IDS = new Set<number>();
for (const p of SPECIES) {
  let parent = p.evolvesFrom;
  const visited = new Set<number>();
  while (parent != null && !visited.has(parent)) {
    visited.add(parent);
    const ancestor = SPECIES_BY_ID.get(parent);
    if (!ancestor) break;
    if (REGIONAL_RE.test(ancestor.name)) {
      REGIONAL_FAMILY_IDS.add(p.id);
      break;
    }
    parent = ancestor.evolvesFrom;
  }
}

function asGen(n: number): GenNumber {
  if ((GEN_NUMBERS as readonly number[]).includes(n)) return n as GenNumber;
  return 9;
}

const ALL: PickerMon[] = [];
const BY_ID = new Map<number, PickerMon>();
const LINE_BY_ID = new Map<number, number>();
const STAGE_BY_ID = new Map<number, number>();
const FIRST_BY_LINE = new Map<number, number>();
const OGERPON_FORM_ORDER = new Map(
  [1017, 10273, 10274, 10275].map((id, index) => [id, index]),
);

for (const p of SPECIES) {
  const first = FIRST_BY_LINE.get(p.evolutionChainId);
  if (first == null || p.id < first) FIRST_BY_LINE.set(p.evolutionChainId, p.id);
}

function pushMon(mon: PickerMon): void {
  if (BY_ID.has(mon.id)) return;
  ALL.push(mon);
  BY_ID.set(mon.id, mon);
}

for (const p of SPECIES) {
  const pickerId = p.id === 10178 ? 10179 : p.id === 10179 ? 10180 : p.id === 10227 ? 10191 : p.id;
  LINE_BY_ID.set(pickerId, p.evolutionChainId);
  STAGE_BY_ID.set(pickerId, p.evolutionStage);
  pushMon({
    id: pickerId,
    name: p.id === 892 ? 'urshifu-single-strike' : p.name,
    types: p.id === 888 ? ['fairy'] : p.id === 889 ? ['fighting'] : p.types,
    generation: asGen(p.generation),
    sprite: [746, 888, 889, 964, 1024].includes(p.id) ? `/sprites/pokemon/${p.id}.png` : pickerId === 10191 ? '/sprites/pokemon/10191.png' : p.sprite,
    source: 'dex',
    ownerId: p.id === 10227 ? 892 : pickerId,
  });
}

for (const form of ALTERNATE_PICKER_FORMS) {
  const owner = BY_ID.get(form.ownerId);
  if (!owner) continue;
  LINE_BY_ID.set(form.id, LINE_BY_ID.get(owner.id) ?? owner.id);
  pushMon({
    id: form.id,
    name: form.name,
    types: form.types,
    generation: form.generation ?? owner.generation,
    sprite: `/sprites/pokemon/${form.id}.png`,
    source: form.id === 10228 ? 'powerup' : 'dex',
    ownerId: owner.id,
  });
}

for (const [ownerRaw, kinds] of Object.entries(FORMS)) {
  const ownerId = Number(ownerRaw);
  const owner = BY_ID.get(ownerId);
  if (!owner) continue;
  for (const kind of ['mega', 'dynamax'] as const) {
    for (const form of kinds[kind] ?? []) {
      pushMon({
        id: form.id,
        name: form.label,
        types: owner.types,
        generation: owner.generation,
        sprite: `/sprites/pokemon/${form.id}.png`,
        source: 'powerup',
        ownerId,
      });
    }
  }
}

const rapidStrike = BY_ID.get(10191);
if (rapidStrike) {
  pushMon({
    ...rapidStrike,
    id: 10227,
    name: 'Gigantamax Urshifu Rapid Strike',
    sprite: '/sprites/pokemon/10227.png',
    source: 'powerup',
  });
}

export function allPickerMons(): readonly PickerMon[] {
  return ALL;
}

export function getPickerMon(id: number): PickerMon | undefined {
  return BY_ID.get(id);
}

export function isRegional(mon: PickerMon): boolean {
  return REGIONAL_RE.test(mon.name);
}

export function isRegionalFamily(mon: PickerMon): boolean {
  return isRegional(mon) || REGIONAL_FAMILY_IDS.has(mon.id) || REGIONAL_FAMILY_IDS.has(mon.ownerId);
}

export function isNewDexRiff(mon: PickerMon): boolean {
  return isRegional(mon) || CONVERGENT_IDS.has(mon.id) || PARADOX_IDS.has(mon.id);
}

export function isPowerupForm(mon: PickerMon): boolean {
  return mon.source === 'powerup';
}

const TERASTAL_FORM_IDS = new Set([10276, 10277]);

export function isTerastalForm(mon: PickerMon): boolean {
  return TERASTAL_FORM_IDS.has(mon.id);
}

export function isGimmickForm(mon: PickerMon): boolean {
  // Ultra Necrozma is reached with Ultranecrozium Z, not Mega Evolution.
  return isPowerupForm(mon) || isTerastalForm(mon) || mon.id === 10157;
}

export function isStarter(mon: PickerMon): boolean {
  return STARTER_IDS.has(mon.id) || mon.id === 25 || mon.id === 133;
}

/** Evolution chain for this form. Members of one chain stay on one picker row. */
export function evolutionLineKey(mon: PickerMon): number {
  return LINE_BY_ID.get(mon.id) ?? LINE_BY_ID.get(mon.ownerId) ?? mon.id;
}

export function comparePickerOrder(a: PickerMon, b: PickerMon): number {
  const lineA = evolutionLineKey(a);
  const lineB = evolutionLineKey(b);
  const firstA = FIRST_BY_LINE.get(lineA) ?? a.ownerId;
  const firstB = FIRST_BY_LINE.get(lineB) ?? b.ownerId;
  const stageA = STAGE_BY_ID.get(a.id) ?? STAGE_BY_ID.get(a.ownerId) ?? 1;
  const stageB = STAGE_BY_ID.get(b.id) ?? STAGE_BY_ID.get(b.ownerId) ?? 1;
  const ogerponOrder = a.ownerId === 1017 && b.ownerId === 1017
    ? (OGERPON_FORM_ORDER.get(a.id) ?? 99) - (OGERPON_FORM_ORDER.get(b.id) ?? 99)
    : 0;
  return firstA - firstB || stageA - stageB || a.ownerId - b.ownerId || ogerponOrder || a.id - b.id;
}

const LEGENDARY_OWNER_IDS = new Set<number>();
for (const p of SPECIES) {
  if (p.isLegendary || p.isMythical || ULTRA_BEAST_IDS.has(p.id) || LEGENDARY_PARADOX_IDS.has(p.id)) {
    LEGENDARY_OWNER_IDS.add(p.id);
  }
}

export function isLegendaryEligible(mon: PickerMon): boolean {
  return LEGENDARY_OWNER_IDS.has(mon.id) || LEGENDARY_OWNER_IDS.has(mon.ownerId);
}
