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

function pushMon(mon: PickerMon): void {
  if (BY_ID.has(mon.id)) return;
  ALL.push(mon);
  BY_ID.set(mon.id, mon);
}

for (const p of SPECIES) {
  pushMon({
    id: p.id,
    name: p.name,
    types: p.types,
    generation: asGen(p.generation),
    sprite: p.sprite,
    source: 'dex',
    ownerId: p.id,
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
  return STARTER_IDS.has(mon.id);
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
