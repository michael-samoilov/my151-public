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

function asGen(n: number): GenNumber {
  if ((GEN_NUMBERS as readonly number[]).includes(n)) return n as GenNumber;
  return 9;
}

const ALL: PickerMon[] = [];
const BY_ID = new Map<number, PickerMon>();
const LINE_BY_ID = new Map<number, number>();

function pushMon(mon: PickerMon): void {
  if (BY_ID.has(mon.id)) return;
  ALL.push(mon);
  BY_ID.set(mon.id, mon);
}

for (const p of SPECIES) {
  const pickerId = p.id === 10178 ? 10179 : p.id === 10179 ? 10180 : p.id === 10227 ? 10191 : p.id;
  LINE_BY_ID.set(pickerId, p.evolutionChainId);
  pushMon({
    id: pickerId,
    name: p.id === 892 ? 'urshifu-single-strike' : p.name,
    types: p.types,
    generation: asGen(p.generation),
    sprite: pickerId === 10191 ? '/sprites/pokemon/10191.png' : p.sprite,
    source: 'dex',
    ownerId: pickerId,
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

export function isNewDexRiff(mon: PickerMon): boolean {
  return isRegional(mon) || CONVERGENT_IDS.has(mon.id) || PARADOX_IDS.has(mon.id);
}

export function isPowerupForm(mon: PickerMon): boolean {
  return mon.source === 'powerup';
}

export function isStarter(mon: PickerMon): boolean {
  return STARTER_IDS.has(mon.id) || mon.id === 10158 || mon.id === 10159;
}

/** Evolution chain for this form. Members of one chain stay on one picker row. */
export function evolutionLineKey(mon: PickerMon): number {
  return LINE_BY_ID.get(mon.id) ?? LINE_BY_ID.get(mon.ownerId) ?? mon.id;
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
