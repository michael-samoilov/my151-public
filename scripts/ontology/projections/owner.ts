/**
 * Which tool rows a form belongs under. No sprite URLs, so the ontology build can import it
 * without the app's path aliases.
 */
import type { ResolvedForm, StateKind } from '../../../src/ontology/model';
import type { Ontology } from '../resolve';

const POWER_UP: ReadonlySet<StateKind> = new Set(['mega', 'primal', 'gigantamax']);
export const isPowerUp = (form: ResolvedForm): boolean => form.states.some((state) => POWER_UP.has(state.kind));

export const pickerId = (ontology: Ontology, form: ResolvedForm): number => ontology.authored.legacy.picker.ids[form.id] ?? form.appId;

function regionOf(ontology: Ontology, form: ResolvedForm): string | null {
  return form.states.length ? regionOf(ontology, ontology.forms.get(form.enteredFrom[0])!) : form.coordinates.region;
}

/** The Picker's ownerId: a Dex row owns itself; a form of a regional Dex row belongs to it; everything else to the species. */
export function pickerOwner(ontology: Ontology, form: ResolvedForm): ResolvedForm {
  const legacyOwner = ontology.authored.legacy.picker.owners[form.id];
  if (legacyOwner) return ontology.forms.get(legacyOwner)!;
  if (form.tools.dex === 'in') return form;
  const species = ontology.species.get(form.species)!;
  const region = regionOf(ontology, form);
  const members = species.forms.map((id) => ontology.forms.get(id)!);
  const regional = region && members.find((other) =>
    other.tools.dex === 'in' && other.states.length === 0 && other.coordinates.region === region
    && Object.keys(other.coordinates.variety).length === 0 && other.coordinates.sex === null);
  return regional || members[0];
}
