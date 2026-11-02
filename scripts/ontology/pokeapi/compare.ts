/**
 * What the ontology and the pinned PokeAPI snapshot disagree on. npm run ontology:audit writes the
 * disagreements to data/ontology/reports/, and npm run ontology:check proves every one is listed
 * there and reviewed, so a changed fact that no longer matches the source cannot ship unreviewed.
 */
import type { FormId } from '../../../src/ontology/ids';
import type { ResolvedForm } from '../../../src/ontology/model';
import { INHERITED_UNSOURCED, type FormEntry, type SpeciesFile } from '../authored';
import type { Ontology } from '../resolve';
import { appGrowthRate, pokeapiIdentityOf, type PokeapiFormRow, type PokeapiIdentity } from './source';

/** Which PokeAPI table states the fact. PokeAPI gives color, shape, and egg groups per species, so a form's own value has no counterpart of its own. */
export type Level = 'form' | 'pokemon' | 'species';

export interface Disagreement {
  readonly form: FormId;
  readonly fact: string;
  readonly level: Level;
  readonly app: unknown;
  readonly source: unknown;
}

export type Review =
  | { readonly status: 'unreviewed' }
  /** The app keeps its value; the decision names where that was decided. auto marks a review a rule in audit.ts wrote. */
  | { readonly status: 'kept'; readonly decision: string; readonly note: string; readonly auto?: true }
  /** The source cannot settle it. The note carries the evidence on each side for Michael. */
  | { readonly status: 'open'; readonly note: string };

export interface AuditRow extends Disagreement {
  readonly review: Review;
}

export interface AuditReport {
  readonly source: string;
  readonly generated: string;
  readonly notes: readonly string[];
  readonly summary: Readonly<Record<string, number>>;
  readonly rows: readonly AuditRow[];
  readonly unmatched?: readonly { readonly form: FormId; readonly inherits: readonly string[] }[];
  readonly missingStateForms?: readonly { readonly pokeapiForm: string; readonly species: string; readonly note: string }[];
  /** Hand-written: what the snapshot cannot settle and no row carries. The audit script keeps this section as it finds it. */
  readonly questions?: readonly { readonly id: string; readonly question: string; readonly evidence: readonly string[]; readonly recommendation: string }[];
}

export const AUDIT_REPORTS = {
  classification: 'data/ontology/reports/classification-audit.json',
  fact: 'data/ontology/reports/fact-audit.json',
} as const;
export type AuditKind = keyof typeof AUDIT_REPORTS;

export const rowKey = (row: Disagreement): string => `${row.form}|${row.fact}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface Linked {
  readonly form: ResolvedForm;
  readonly entry: FormEntry | SpeciesFile['forms'][0];
  readonly identity: PokeapiIdentity;
}

/** Every form with its authored entry and PokeAPI identity, in ontology order. */
export function linkedForms(ontology: Ontology): Linked[] {
  const entries = new Map<string, FormEntry | SpeciesFile['forms'][0]>();
  for (const { data } of ontology.authored.species) for (const entry of data.forms) entries.set(entry.id, entry);
  return [...ontology.forms.values()].map((form) => {
    const entry = entries.get(form.id)!;
    const identity = pokeapiIdentityOf(form.id, entry.externalIds, ontology.authored.pokeapi);
    if ('error' in identity) throw new Error(`${form.id}: ${identity.error}`);
    return { form, entry, identity };
  });
}

const unsourced = (entry: Linked['entry'], fact: string): boolean => (entry.sourceOf as Record<string, string> | undefined)?.[fact] === INHERITED_UNSOURCED;

/** The form a Mega, Primal, or Gigantamax enters from, as PokeAPI names it: the identifier minus the step suffix. */
export const POWER_UP_SUFFIX = /-(mega(?:-[xyz])?|primal|gmax)$/;
export const powerUpEntryIdentifier = (identifier: string): string | null => (POWER_UP_SUFFIX.test(identifier) ? identifier.replace(POWER_UP_SUFFIX, '') : null);

export function classificationDisagreements(ontology: Ontology): Disagreement[] {
  const linked = linkedForms(ontology);
  const formOfPokeapi = new Map<string, FormId>();
  for (const { form, identity } of linked) if (identity.kind === 'form') formOfPokeapi.set(identity.form.identifier, form.id);
  const rows: Disagreement[] = [];
  const row = (form: ResolvedForm, fact: string, app: unknown, source: unknown) => {
    if (!same(app, source)) rows.push({ form: form.id, fact, level: 'form', app, source });
  };
  for (const { form, identity } of linked) {
    if (identity.kind !== 'form') continue;
    row(form, 'battleOnly', form.is.battleOnly, identity.form.isBattleOnly);
    row(form, 'mega', form.is.mega, identity.form.isMega);
    row(form, 'default', form.isDefault, identity.form.isDefault && identity.pokemon.isDefault);
    const entryIdentifier = form.states.length ? powerUpEntryIdentifier(identity.form.identifier) : null;
    const entryForm = entryIdentifier === null ? undefined : formOfPokeapi.get(entryIdentifier);
    if (entryForm && !form.enteredFrom.includes(entryForm)) rows.push({ form: form.id, fact: 'entry', level: 'form', app: form.enteredFrom, source: entryForm });
  }
  return rows;
}

/** Mega, Primal, and Gigantamax forms of app species that PokeAPI has and no app form claims. */
export function missingStateForms(ontology: Ontology): NonNullable<AuditReport['missingStateForms']> {
  const claimed = new Set<string>();
  for (const { identity } of linkedForms(ontology)) if (identity.kind === 'form') claimed.add(identity.form.identifier);
  const pokeapi = ontology.authored.pokeapi;
  const isPowerUp = (form: PokeapiFormRow) => form.isMega || POWER_UP_SUFFIX.test(form.identifier);
  return Object.values(pokeapi.forms).filter((form) => isPowerUp(form) && !claimed.has(form.identifier)).flatMap((form) => {
    const species = pokeapi.pokemon[form.pokemon].species;
    if (!ontology.species.has(species as never)) return [];
    const entry = powerUpEntryIdentifier(form.identifier);
    return [{ pokeapiForm: form.identifier, species, note: `PokeAPI names it after ${entry}; the app has no form for it.` }];
  });
}

export function unmatchedForms(ontology: Ontology): NonNullable<AuditReport['unmatched']> {
  return linkedForms(ontology).filter(({ identity }) => identity.kind === 'none').map(({ form, entry }) => ({
    form: form.id,
    inherits: Object.entries(entry.sourceOf ?? {}).filter(([, source]) => source === INHERITED_UNSOURCED).map(([fact]) => fact),
  }));
}

export function factDisagreements(ontology: Ontology): Disagreement[] {
  const rows: Disagreement[] = [];
  for (const { form, entry, identity } of linkedForms(ontology)) {
    if (identity.kind === 'none') continue;
    const { pokemon, species } = identity;
    const row = (fact: string, level: Level, app: unknown, source: unknown) => {
      if (!unsourced(entry, fact) && !same(app, source)) rows.push({ form: form.id, fact, level, app, source });
    };
    const facts = form.facts;
    row('types', 'pokemon', facts.types, pokemon.types);
    row('baseStats', 'pokemon', facts.baseStats, { hp: pokemon.stats.hp, atk: pokemon.stats.atk, def: pokemon.stats.def, spe: pokemon.stats.spe, spa: pokemon.stats.spa, spd: pokemon.stats.spd });
    if (pokemon.abilities.first) row('abilities', 'pokemon', facts.abilities, pokemon.abilities);
    row('heightDm', 'pokemon', facts.heightDm, pokemon.height);
    row('weightHg', 'pokemon', facts.weightHg, pokemon.weight);
    row('color', 'species', facts.color, species.color);
    row('shape', 'species', facts.shape, species.shape);
    row('eggGroups', 'species', [...facts.eggGroups].sort(), [...species.eggGroups].sort());
    if (!form.isDefault) continue;
    const resolved = ontology.species.get(form.species)!;
    row('captureRate', 'species', resolved.captureRate, species.captureRate);
    row('growthRate', 'species', resolved.growthRate, appGrowthRate(species.growthRate));
    // PokeAPI has one legendary flag; the app splits it into sub-legendary and restricted, and
    // tags Ultra Beasts from its own list, so only the flag is compared.
    const legendaryFlag = resolved.legendaryClass === 'sub-legendary' || resolved.legendaryClass === 'restricted' ? 'legendary' : resolved.legendaryClass === 'mythical' ? 'mythical' : 'none';
    row('legendaryClass', 'species', legendaryFlag, species.isMythical ? 'mythical' : species.isLegendary ? 'legendary' : 'none');
    row('baby', 'species', resolved.tags.includes('baby'), species.isBaby);
    row('generation', 'species', resolved.generation, species.generation);
    row('genderRatio', 'species', resolved.genderRatio, species.genderRate === -1 ? { kind: 'genderless' } : { kind: 'ratio', femaleEighths: species.genderRate });
    row('hatchCycles', 'species', resolved.hatchCycles, species.hatchCounter);
    row('baseFriendship', 'species', resolved.baseFriendship, species.baseHappiness);
    row('genus', 'species', resolved.genus.en, species.genus);
  }
  return rows;
}

export const disagreementsOf = { classification: classificationDisagreements, fact: factDisagreements } as const satisfies Record<AuditKind, (ontology: Ontology) => Disagreement[]>;
