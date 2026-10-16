

import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

const TYPE_BY_ID: Record<number, string> = {
  1: 'normal', 2: 'fighting', 3: 'flying', 4: 'poison', 5: 'ground', 6: 'rock',
  7: 'bug', 8: 'ghost', 9: 'steel', 10: 'fire', 11: 'water', 12: 'grass',
  13: 'electric', 14: 'psychic', 15: 'ice', 16: 'dragon', 17: 'dark', 18: 'fairy',
};
const CATEGORY_BY_ID: Record<number, string> = { 1: 'status', 2: 'physical', 3: 'special' };
// Modern contest names: PokeAPI's "beauty" is displayed Beautiful, "smart" Clever.
const CONTEST_BY_ID: Record<number, string> = {
  1: 'cool', 2: 'beautiful', 3: 'cute', 4: 'clever', 5: 'tough',
};

/**
 * Z-moves are not teachable TMs. The generic ones sit in 622–658, but the
 * signature ones are scattered (695–703, 719, 723–728…). Every Z-move has
 * 1 PP, and the only regular 1-PP move is Sketch — so PP is the filter.
 */
const SKETCH_ID = 166;

interface MoveRow {
  id: number;
  name: string;
  type: string;
  category: string;
  pp: number;
  power: number | null;
  accuracy: number | null;
  contest: string | null;
}

function parseCsv(text: string): string[][] {
  // RFC-4180-ish: quoted fields may hold commas and doubled quotes. Some
  // localized rows in move_names.csv need this; the id/language columns we
  // read never do, but the parser has to get past them.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, '')); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchCsv(name: string): Promise<string[][]> {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

async function main() {
  const [moves, names] = await Promise.all([
    fetchCsv('moves.csv'),
    fetchCsv('move_names.csv'),
  ]);

  const [header, ...rows] = moves;
  const col = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`moves.csv: no column ${n}`);
    return i;
  };
  const cId = col('id');
  const cIdent = col('identifier');
  const cType = col('type_id');
  const cPower = col('power');
  const cPp = col('pp');
  const cAcc = col('accuracy');
  const cClass = col('damage_class_id');
  const cContest = col('contest_type_id');

  const english = new Map<number, string>();
  for (const [id, lang, name] of names.slice(1)) {
    if (lang === '9') english.set(Number(id), name);
  }

  const out: MoveRow[] = [];
  for (const r of rows) {
    const id = Number(r[cId]);
    if (id >= 10000) continue;
    const ident = r[cIdent];
    if (ident.startsWith('max-') || ident.startsWith('g-max-')) continue;
    const type = TYPE_BY_ID[Number(r[cType])];
    const category = CATEGORY_BY_ID[Number(r[cClass])];
    const pp = Number(r[cPp]);
    if (!type || !category || !pp) continue;
    if (pp === 1 && id !== SKETCH_ID) continue;
    out.push({
      id,
      name: english.get(id) ?? ident,
      type,
      category,
      pp,
      power: r[cPower] ? Number(r[cPower]) : null,
      accuracy: r[cAcc] ? Number(r[cAcc]) : null,
      contest: r[cContest] ? CONTEST_BY_ID[Number(r[cContest])] ?? null : null,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync('src/data/moves.json', JSON.stringify(out));
  console.log(`wrote src/data/moves.json: ${out.length} moves`);
}

void main();
