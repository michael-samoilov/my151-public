/**
 * Prints the league card's derived shades per type, with the perceptual
 * distance between the closest pair.
 *
 * Run it when the card's colour ramp changes:
 *
 *     node_modules/.bin/tsx scripts/shade-report.ts
 *
 * The eye is a poor judge of whether eighteen colours separate — fighting
 * and ground read as the same brown until the number says they are 2.8
 * apart. `src/league/theme.test.ts` holds the floor this report explains.
 */
import { TYPE_NAMES } from '../src/types/pokemon';
import { TYPE_COLORS } from '../src/data/type-colors';
import { cardShades } from '../src/league/theme';
import { contrastWithWhite, deltaE2000 } from '../src/league/colorMetrics';

type Key = 'cell' | 'band';

const rows = TYPE_NAMES.map((t) => {
  const s = cardShades(t);
  return [
    t,
    TYPE_COLORS[t],
    s.cell,
    s.band,
    contrastWithWhite(s.cell).toFixed(2),
    contrastWithWhite(s.band).toFixed(2),
  ];
});

console.log('type      source   cell     band     cell:w  band:w');
for (const r of rows) console.log(r[0].padEnd(9), r[1], r[2], r[3], r[4].padStart(5), r[5].padStart(6));

for (const key of ['cell', 'band'] as Key[]) {
  const pairs: { a: string; b: string; d: number }[] = [];
  for (let i = 0; i < TYPE_NAMES.length; i++) {
    for (let j = i + 1; j < TYPE_NAMES.length; j++) {
      pairs.push({
        a: TYPE_NAMES[i],
        b: TYPE_NAMES[j],
        d: deltaE2000(cardShades(TYPE_NAMES[i])[key], cardShades(TYPE_NAMES[j])[key]),
      });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  console.log(`\n--- ${key}: closest six pairs (ΔE2000) ---`);
  for (const p of pairs.slice(0, 6)) console.log(`${p.a}/${p.b}`.padEnd(22), p.d.toFixed(2));
  const named = (a: string, b: string) =>
    pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))!.d.toFixed(2);
  console.log(`min ${pairs[0].d.toFixed(2)}   median ${pairs[(pairs.length / 2) | 0].d.toFixed(2)}`);
  console.log(`fighting/ground ${named('fighting', 'ground')}   ghost/fairy ${named('ghost', 'fairy')}`);
}

const cw = TYPE_NAMES.map((t) => contrastWithWhite(cardShades(t).cell));
const bw = TYPE_NAMES.map((t) => contrastWithWhite(cardShades(t).band));
console.log(`\ncell vs white ${Math.min(...cw).toFixed(2)}–${Math.max(...cw).toFixed(2)}:1`);
console.log(`band vs white ${Math.min(...bw).toFixed(2)}–${Math.max(...bw).toFixed(2)}:1`);
