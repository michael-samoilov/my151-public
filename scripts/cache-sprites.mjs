/**
 * Downloads all PokeAPI sprites used by the app into public/ for offline use.
 * Run: node scripts/cache-sprites.mjs
 */
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');

const POKEAPI_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

// Retry-capable fetch
async function download(url, dest) {
  if (existsSync(dest)) return; // skip if already cached
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      return;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// Batch downloads with concurrency limit
async function downloadAll(items, concurrency = 10) {
  let i = 0;
  let done = 0;
  const total = items.length;
  async function next() {
    while (i < items.length) {
      const item = items[i++];
      await download(item.url, item.dest);
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(`  ${done}/${total}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
}

async function main() {
  const downloads = [];

  // 1. Pokemon sprites (base + shiny for specific IDs)
  console.log('Reading pokemon.json...');
  const pokemon = JSON.parse(readFileSync(join(ROOT, 'src/data/pokemon.json'), 'utf-8'));
  const spriteIds = new Set();
  for (const p of pokemon) {
    // Extract ID from URL like .../pokemon/123.png
    const match = p.sprite.match(/\/pokemon\/(\d+)\.png$/);
    if (match) spriteIds.add(match[1]);
  }
  for (const id of spriteIds) {
    downloads.push({
      url: `${POKEAPI_BASE}/pokemon/${id}.png`,
      dest: join(PUBLIC, 'sprites', 'pokemon', `${id}.png`),
    });
  }

  // 2. Shiny sprites
  const shinyIds = [77, 130, 147, 443, 612];
  for (const id of shinyIds) {
    downloads.push({
      url: `${POKEAPI_BASE}/pokemon/shiny/${id}.png`,
      dest: join(PUBLIC, 'sprites', 'pokemon', 'shiny', `${id}.png`),
    });
  }

  // 3. Sprite override (Darmanitan Zen → 10017)
  if (!spriteIds.has('10017')) {
    downloads.push({
      url: `${POKEAPI_BASE}/pokemon/10017.png`,
      dest: join(PUBLIC, 'sprites', 'pokemon', '10017.png'),
    });
  }

  // 4. Type icons
  const typeIds = {
    normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
    bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
    electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
  };
  for (const [, id] of Object.entries(typeIds)) {
    downloads.push({
      url: `${POKEAPI_BASE}/types/generation-viii/sword-shield/small/${id}.png`,
      dest: join(PUBLIC, 'sprites', 'types', `${id}.png`),
    });
  }

  // Filter out already-cached
  const needed = downloads.filter(d => !existsSync(d.dest));
  console.log(`${downloads.length} total sprites, ${needed.length} to download...`);

  if (needed.length > 0) {
    await downloadAll(needed);
  }

  console.log('Done! All sprites cached in public/sprites/');
}

main().catch(e => { console.error(e); process.exit(1); });
