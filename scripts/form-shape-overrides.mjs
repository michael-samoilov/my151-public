import { readFileSync } from 'node:fs';

const formShapes = JSON.parse(readFileSync(new URL('../src/data/form-shapes.json', import.meta.url), 'utf8'));
const review = JSON.parse(readFileSync(new URL('../docs/favorite-picker-work/form-shape-review/review.json', import.meta.url), 'utf8'));
const identities = new Map(review.documentedFormDifferences.mismatches.map(row => [row.pickerId, row]));
if (Object.keys(formShapes).length !== identities.size || [...identities].some(([id, row]) => formShapes[id] !== row.listedShapeKey)) {
  throw new Error('Form-shape overrides differ from the reviewed identities and classifications.');
}

export function refreshedShape(pokemon, fallback) {
  const reviewed = identities.get(pokemon.id);
  if (!reviewed) return fallback;
  if (reviewed.currentName !== pokemon.name) throw new Error(`Form-shape identity changed: ${pokemon.id} ${pokemon.name}`);
  return formShapes[pokemon.id];
}
