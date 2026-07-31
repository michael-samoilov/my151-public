import type { TypeName } from '@/types/pokemon';

/**
 * The official Gen IX badge palette, sampled from the badge art itself.
 *
 * Sixteen of the eighteen already matched; `ground` (#945121) and `dragon`
 * (#5261DE) had drifted, which only became visible once the badge stopped being
 * a picture and started being a filled shape next to the same sprites.
 *
 * Not to be confused with the `--color-type-*` tokens in `src/index.css`, which
 * are a different (Bulbapedia) palette used for chart series.
 */
export const TYPE_COLORS: Record<TypeName, string> = {
  normal: '#9FA19F',
  fire: '#E62829',
  water: '#2980EF',
  electric: '#FAC000',
  grass: '#3FA129',
  ice: '#3FD8FF',
  fighting: '#FF8000',
  poison: '#9040CC',
  ground: '#915121',
  flying: '#81B9EF',
  psychic: '#EF4179',
  bug: '#91A119',
  rock: '#AFA981',
  ghost: '#704170',
  dragon: '#5061E1',
  dark: '#50413F',
  steel: '#60A1B8',
  fairy: '#EF71EF',
};

