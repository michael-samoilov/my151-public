import pokemonData from '@/data/pokemon.json';
import { pokemonSpriteUrl, revisedSprite } from '@/lib/spriteUrl';
import {
  LEGENDARY_PARADOX_IDS,
  PARADOX_IDS,
  STARTER_IDS,
  ULTRA_BEAST_IDS,
} from '@/data/categories';
import favorites from '@/data/generated/favorites.json';
import altFormSpecies from '@/i18n/alt-form-species.json';
import type { Pokemon, TypeName } from '@/types/pokemon';
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

type PickerFields = Partial<Omit<PickerMon, 'sprite'>> & { spriteStem?: string };
type PickerForm = PickerFields & { id: number; owner: number; name: string };
const GENERATED = favorites as unknown as {
  dexOverrides: Record<string, PickerFields>;
  forms: PickerForm[];
};

const SPECIES = pokemonData as Pokemon[];

const REGIONAL_RE = /-(alola|galar|hisui|paldea)(?!-cap)(?:-|$)/;
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
const DEX_ID_BY_PICKER_ID = new Map<number, number>();
const LINE_BY_ID = new Map<number, number>();
const listedOrder = (ids: number[]) => new Map(ids.map((id, index) => [id, index]));
const FORM_ORDER_BY_OWNER = new Map([
  [1017, listedOrder([1017, 11113, 10273, 11114, 10274, 11115, 10275, 11116])],
  [646, listedOrder([646, 10022, 11107, 10023, 11108])],
  [800, listedOrder([800, 10155, 10156, 10157])],
  [1024, listedOrder([1024, 10276, 10277])],
]);
const COSPLAY_PIKACHU_FORM_ORDER = new Map(
  [10085, 10080, 10081, 10082, 10083, 10084].map((id, index) => [id, 10080 + index]),
);

function pushMon(mon: PickerMon): void {
  if (BY_ID.has(mon.id)) return;
  ALL.push(mon);
  BY_ID.set(mon.id, mon);
}

for (const p of SPECIES) {
  const { spriteStem, ...fields } = GENERATED.dexOverrides[p.id] ?? {};
  const pickerId = fields.id ?? p.id;
  DEX_ID_BY_PICKER_ID.set(pickerId, p.id);
  LINE_BY_ID.set(pickerId, p.evolutionChainId);
  pushMon({
    id: pickerId,
    name: fields.name ?? p.name,
    types: fields.types ?? p.types,
    generation: asGen(fields.generation ?? p.generation),
    sprite: spriteStem ? pokemonSpriteUrl(spriteStem) : revisedSprite(p.sprite),
    source: fields.source ?? 'dex',
    ownerId: fields.ownerId ?? pickerId,
  });
}

for (const { owner: ownerId, spriteStem, ...form } of GENERATED.forms) {
  const owner = BY_ID.get(ownerId)!;
  LINE_BY_ID.set(form.id, LINE_BY_ID.get(owner.id) ?? owner.id);
  pushMon({
    id: form.id,
    name: form.name,
    types: form.types ?? owner.types,
    generation: form.generation ?? owner.generation,
    sprite: pokemonSpriteUrl(spriteStem ?? form.id),
    source: form.source ?? 'dex',
    ownerId,
  });
}

export function allPickerMons(): readonly PickerMon[] {
  return ALL;
}

export function getPickerMon(id: number): PickerMon | undefined {
  return BY_ID.get(id);
}

export function pickerDexId(mon: PickerMon): number {
  return DEX_ID_BY_PICKER_ID.get(mon.id) ?? DEX_ID_BY_PICKER_ID.get(mon.ownerId) ?? mon.ownerId;
}

export function pickerNameId(mon: PickerMon): number {
  return DEX_ID_BY_PICKER_ID.get(mon.id) ?? mon.id;
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

const TERASTAL_FORM_IDS = new Set([10276, 10277, 11113, 11114, 11115, 11116]);

function isTerastalForm(mon: PickerMon): boolean {
  return TERASTAL_FORM_IDS.has(mon.id);
}

export function isGimmickForm(mon: PickerMon): boolean {
  return isPowerupForm(mon) || isTerastalForm(mon) || mon.id === 10157;
}

export function isStarter(mon: PickerMon): boolean {
  return STARTER_IDS.has(mon.id) || mon.id === 25 || mon.id === 133;
}

export function evolutionLineKey(mon: PickerMon): number {
  return LINE_BY_ID.get(mon.id) ?? LINE_BY_ID.get(mon.ownerId) ?? mon.id;
}

export function hasListedFormOrder(ownerId: number): boolean {
  return FORM_ORDER_BY_OWNER.has(ownerId);
}

export function nationalDexNumber(mon: PickerMon): number {
  const owner = pickerNameId(getPickerMon(mon.ownerId) ?? mon);
  return (altFormSpecies as Record<string, number>)[owner] ?? owner;
}

export function comparePickerOrder(a: PickerMon, b: PickerMon): number {
  const ownerOrder = a.ownerId === b.ownerId ? FORM_ORDER_BY_OWNER.get(a.ownerId) : undefined;
  const listedFormOrder = ownerOrder ? (ownerOrder.get(a.id) ?? 99) - (ownerOrder.get(b.id) ?? 99) : 0;
  const floetteEternalLast = a.ownerId === 670 && b.ownerId === 670
    ? Number(a.id === 10061) - Number(b.id === 10061)
    : 0;
  const formOrder = (COSPLAY_PIKACHU_FORM_ORDER.get(a.id) ?? a.id) - (COSPLAY_PIKACHU_FORM_ORDER.get(b.id) ?? b.id);
  return nationalDexNumber(a) - nationalDexNumber(b) || a.ownerId - b.ownerId || listedFormOrder || floetteEternalLast || formOrder;
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
