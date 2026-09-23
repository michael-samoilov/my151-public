import { describe, expect, it } from 'vitest';
import { allPickerMons, getPickerMon } from './catalog';
import { GEN_NUMBERS, TYPES18, type GenNumber } from './cells';
import {
  applyPathToTypeMap,
  enumeratePaths,
  packingNeeded,
  packListMode,
  packStepOptions,
  selectorChain,
  uniqueChains,
  type TypeFills,
} from './packing';
import type { TypeName } from '@/types/pokemon';
import type { PickerMon } from './catalog';

function mon(id: number, fallback: Partial<PickerMon> = {}): PickerMon {
  const found = getPickerMon(id);
  if (found) return found;
  return {
    id,
    name: fallback.name ?? `mon-${id}`,
    types: fallback.types ?? ['normal'],
    generation: fallback.generation ?? 2,
    sprite: `/sprites/pokemon/${id}.png`,
    source: 'dex',
    ownerId: id,
    ...fallback,
  };
}

describe('selectorChain', () => {
  it('shows the incoming Pokémon faded in the vacated origin, not a blank', () => {
    const azu = mon(184);
    const path = [
      { mon: azu, from: 'water' as const, to: 'fairy' as const, kind: 'slide' as const },
    ];
    const slots = selectorChain(path);
    expect(slots[0]).toMatchObject({ type: 'water', role: 'vacate', mon: azu });
    expect(slots[0].mon?.id).toBe(184);
    expect(slots[1]).toMatchObject({ type: 'fairy', role: 'place', mon: azu });
  });
});

describe('enumeratePaths', () => {
  it('slides Azumarill Water → Fairy in two short chains when Fairy is taken', () => {
    const azu = mon(184);
    const wiggly = mon(40);
    const map: TypeFills = { water: azu, fairy: wiggly };
    expect(packingNeeded(map, 'fairy', azu)).toBe(true);
    const { paths } = enumeratePaths(map, 'fairy', azu);
    expect(paths.length).toBeGreaterThan(0);
    const shortest = paths[0];
    expect(shortest[0]).toMatchObject({ mon: azu, from: 'water', to: 'fairy' });
    const leave = paths.find((p) => p.some((s) => s.kind === 'leave' && s.mon.id === wiggly.id));
    expect(leave).toBeTruthy();
  });

  it('does not pack when the dest is empty and the form is new to the row', () => {
    const azu = mon(184);
    expect(packingNeeded({}, 'water', azu)).toBe(false);
  });

  it('does not open packing when the destination is empty, even if the form sits elsewhere', () => {
    const golem = mon(76);
    expect(packingNeeded({ ground: golem }, 'rock', golem)).toBe(false);
  });

  it('does not open packing when the only option drops the old occupant', () => {
    const incoming = mon(99101, { types: ['water'] });
    const occupant = mon(99102, { types: ['water'] });
    expect(packingNeeded({ water: occupant }, 'water', incoming)).toBe(false);
    const { paths } = enumeratePaths({ water: occupant }, 'water', incoming);
    expect(paths).toHaveLength(1);
    expect(paths[0].at(-1)).toMatchObject({ mon: occupant, to: null, kind: 'leave' });
  });

  it('does not list a Pokémon who could slide into the hole but does not have to', () => {
    const golem = mon(76);
    const aero = mon(142);
    const nido = mon(34);
    const map: TypeFills = { ground: golem, rock: aero, poison: nido };
    const { paths } = enumeratePaths(map, 'rock', golem);
    const movers = new Set(paths.flat().map((step) => step.mon.id));
    expect(paths.length).toBeGreaterThan(0);
    expect(movers.has(golem.id)).toBe(true);
    expect(movers.has(aero.id)).toBe(true);
    expect(movers.has(nido.id)).toBe(false);
    expect(paths.every((path) => path.every((step) => step.kind !== 'fill'))).toBe(true);
  });

  it('keeps the incoming Pokémon in the opened cell when the occupant is kicked', () => {
    const azu = mon(184);
    const wiggly = mon(40);
    const map: TypeFills = { water: azu, fairy: wiggly };
    const { paths } = enumeratePaths(map, 'fairy', azu);
    const leave = paths.find((path) => path.some((step) => step.kind === 'leave' && step.mon.id === wiggly.id));
    const keep = paths.find((path) => path.every((step) => step.kind !== 'leave'));
    expect(leave).toBeTruthy();
    expect(keep?.some((step) => step.mon.id === wiggly.id && step.to === 'normal')).toBe(true);
    expect(paths.filter((path) => path.some((step) => step.kind === 'leave'))).toHaveLength(1);
    const next = applyPathToTypeMap(map, leave!);
    expect(next.fairy?.id).toBe(azu.id);
    expect(next.water).toBeUndefined();
    expect(Object.values(next).some((slot) => slot?.id === wiggly.id)).toBe(false);
  });
});

describe('worst keep-everyone grid', () => {
  it('reports the longest real cascade', () => {
    const best = longestRealCascade();
    // One keep-everyone cascade plus the direct trash swap.
    // The cascade is 17 links, which is the list that is too long to scan.
    expect(best.listed).toBe(2);
    expect(best.slides).toBe(17);
    expect(best.links).toBe(17);
    const map: TypeFills = {};
    for (const [type, id] of Object.entries(best.fills)) {
      const mon = getPickerMon(id);
      if (mon) map[type as TypeName] = mon;
    }
    const incoming = getPickerMon(best.incoming);
    const chains = uniqueChains(enumeratePaths(map, best.dest, incoming!).paths);
    expect(packListMode(chains)).toBe('stepped');
    const options = packStepOptions(chains, '');
    expect(options).toHaveLength(2);
    expect(options.filter((option) => option.path).length).toBe(1);
    expect(options.filter((option) => !option.path).length).toBe(1);
  }, 20_000);
});

function longestRealCascade(): {
  gen: GenNumber;
  dest: TypeName;
  incoming: number;
  slides: number;
  links: number;
  listed: number;
  fills: Record<string, number>;
} {
  let best: {
    gen: GenNumber;
    dest: TypeName;
    incoming: number;
    slides: number;
    links: number;
    listed: number;
    fills: Record<string, number>;
  } | null = null;

  for (const gen of GEN_NUMBERS) {
    const pool = allPickerMons().filter((mon) => mon.source === 'dex' && mon.generation === gen);
    const duals = pool.filter((mon) => mon.types.length === 2);
    const index = new Map(TYPES18.map((type, i) => [type, i]));
    const edgeMon = new Map<string, PickerMon>();
    const adj: number[][] = TYPES18.map(() => []);
    for (const mon of duals) {
      const [a, b] = mon.types;
      const ia = index.get(a)!;
      const ib = index.get(b)!;
      const key = ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
      if (edgeMon.has(key)) continue;
      edgeMon.set(key, mon);
      adj[ia].push(ib);
      adj[ib].push(ia);
    }

    const memo = new Map<string, number>();
    const nextHop = new Map<string, number>();
    const longestFrom = (mask: number, node: number): number => {
      const key = `${mask}|${node}`;
      const cached = memo.get(key);
      if (cached != null) return cached;
      let bestLen = 0;
      let hop = -1;
      for (const to of adj[node]) {
        const bit = 1 << to;
        if (mask & bit) continue;
        const len = 1 + longestFrom(mask | bit, to);
        if (len > bestLen) {
          bestLen = len;
          hop = to;
        }
      }
      memo.set(key, bestLen);
      nextHop.set(key, hop);
      return bestLen;
    };

    for (let start = 0; start < TYPES18.length; start += 1) {
      const slides = longestFrom(1 << start, start);
      if (!best || slides > best.slides) {
        const types: number[] = [];
        let mask = 1 << start;
        let node = start;
        while (true) {
          const hop = nextHop.get(`${mask}|${node}`);
          if (hop == null || hop < 0) break;
          types.push(node);
          mask |= 1 << hop;
          node = hop;
        }
        const fills: Record<string, number> = {};
        const used = new Set<number>();
        for (let i = 0; i < types.length; i += 1) {
          const from = types[i];
          const to = i + 1 < types.length ? types[i + 1] : node;
          const key = from < to ? `${from}|${to}` : `${to}|${from}`;
          const mon = edgeMon.get(key);
          if (!mon) continue;
          fills[TYPES18[from]] = mon.id;
          used.add(mon.id);
        }
        const dest = TYPES18[start];
        const incoming = pool.find((mon) => mon.types.includes(dest) && !used.has(mon.id));
        if (!incoming || slides < 1) continue;
        const map: TypeFills = {};
        for (const [type, id] of Object.entries(fills)) {
          const mon = getPickerMon(id);
          if (mon) map[type as TypeName] = mon;
        }
        const { paths } = enumeratePaths(map, dest, incoming);
        const keep = paths.filter((path) => path.every((step) => step.kind !== 'leave'));
        const longest = keep.reduce((n, path) => Math.max(n, path.length), 0);
        best = {
          gen,
          dest,
          incoming: incoming.id,
          slides: longest,
          links: selectorChain(keep[0] ?? []).length,
          listed: paths.length,
          fills,
        };
      }
    }
  }

  if (!best) throw new Error('no cascade');
  return best;
}
