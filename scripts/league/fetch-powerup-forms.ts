

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pokemonData from '../../src/data/pokemon.json' with { type: 'json' };
import type { Pokemon } from '../../src/types/pokemon';
import type { PowerupKind, PowerupForms } from '../../src/league/model/powerups';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon.csv';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/**
 * Suffix → which powerup the form belongs to, and how it reads in the UI.
 *
 * The lettered suffixes are their own entries because `-mega-z` does not end
 * with `-mega`: dropping them lost Absol, Garchomp and Lucario's second Mega
 * without a word.
 *
 * `-eternamax` is left out on purpose. Eternamax Eternatus is a raid boss,
 * not a form a trainer takes, and Eternatus can only reach a card through
 * the legendary slot, which carries no powerup buttons.
 */
const SUFFIXES: { suffix: string; kind: PowerupKind; label: (species: string) => string }[] = [
  { suffix: '-mega-x', kind: 'mega', label: (s) => `Mega ${s} X` },
  { suffix: '-mega-y', kind: 'mega', label: (s) => `Mega ${s} Y` },
  { suffix: '-mega-z', kind: 'mega', label: (s) => `Mega ${s} Z` },
  { suffix: '-mega', kind: 'mega', label: (s) => `Mega ${s}` },
  { suffix: '-primal', kind: 'mega', label: (s) => `Primal ${s}` },
  { suffix: '-gmax', kind: 'dynamax', label: (s) => `Gigantamax ${s}` },
];

const species = new Map((pokemonData as unknown as Pokemon[]).map((p) => [p.id, p]));

function titleCase(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function main() {
  const res = await fetch(CSV);
  if (!res.ok) throw new Error(`pokemon.csv: ${res.status}`);
  const rows = (await res.text()).trim().split('\n').slice(1);

  const dir = join(ROOT, 'public/sprites/pokemon');
  mkdirSync(dir, { recursive: true });

  const forms: PowerupForms = {};
  const seen = new Map<string, number>();
  let noSpecies = 0;
  let noSprite = 0;
  let duplicate = 0;
  let fetched = 0;

  for (const row of rows) {
    const [rawId, identifier, speciesId] = row.split(',');
    const match = SUFFIXES.find((s) => identifier.endsWith(s.suffix));
    if (!match) continue;
    const owner = species.get(Number(speciesId));
    if (!owner) {
      noSpecies++;
      continue;
    }
    const id = Number(rawId);
    const label = match.label(titleCase(owner.name));

    // Forms of a *form* — meowstic-male-mega, tatsugiri-curly-mega — are the
    // same Mega wearing a cosmetic variant, and they read identically. One
    // per label, lowest id, which keeps Charizard's X and Y (their labels
    // differ) and collapses Tatsugiri's three into one.
    const key = `${owner.id}:${label}`;
    if (seen.has(key)) {
      duplicate++;
      continue;
    }

    // A form with no sprite cannot be drawn, so it is not a form this app
    // has. PokeAPI's `zygarde-mega` row has no sprite; the app ships its own
    // 10301.png, which the existence check below keeps.
    const dest = join(dir, `${id}.png`);
    if (!existsSync(dest)) {
      const sprite = await fetch(`${SPRITES}/${id}.png`);
      if (!sprite.ok) {
        noSprite++;
        continue;
      }
      writeFileSync(dest, Buffer.from(await sprite.arrayBuffer()));
      fetched++;
    }

    seen.set(key, id);
    const entry = (forms[owner.id] ??= { mega: [], dynamax: [] });
    entry[match.kind].push({ id, label });
  }

  for (const entry of Object.values(forms)) {
    for (const kind of ['mega', 'dynamax'] as PowerupKind[]) {
      entry[kind].sort((a, b) => a.id - b.id);
    }
  }

  const out = join(ROOT, 'src/league/data/powerupForms.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(forms, null, 0)}\n`);

  const owners = Object.keys(forms).length;
  const mega = Object.values(forms).reduce((n, f) => n + f.mega.length, 0);
  const gmax = Object.values(forms).reduce((n, f) => n + f.dynamax.length, 0);
  console.log(`${owners} species: ${mega} mega/primal, ${gmax} gigantamax`);
  console.log(`${fetched} sprites downloaded`);
  console.log(`dropped: ${duplicate} variant duplicates, ${noSprite} without a sprite, ${noSpecies} outside the dataset`);
}

await main();
