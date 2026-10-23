import formShapes from './form-shapes.json';
import type { ShapeName } from '@/types/pokemon';

const overrides = formShapes as Partial<Record<number, ShapeName>>;

export function pokemonShape(id: number, fallback: ShapeName): ShapeName {
  return overrides[id] ?? fallback;
}
