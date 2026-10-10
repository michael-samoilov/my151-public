/**
 * Builds the Favorite Pokémon Picker's sprite packs.
 *
 * The Picker shows 1,391 sprites of about 1 KB each. As single files, a phone
 * visit made about 1,100 requests. A pack is many sprites' PNG files in one
 * file, so a visit makes about 15. The format and the grouping are in
 * src/favorites/model/spritePacks.ts, which this plugin runs in Node, so the
 * build and the browser agree on every pack.
 *
 * Two kinds of pack, both under /sprites/packs/, which is cached for a year.
 * Not /assets/: a deploy keeps the /assets/ files of earlier deploys for open
 * tabs (scripts/keep-previous-assets.ts on production), and a tab that misses
 * a pack loads single files instead, so packs need no place in that budget.
 *
 * - Bulk packs, in the order the Picker needs them: Normal / Gen I, then one
 *   per generation. A pack over PACK_BYTES is split. Each is named by a hash
 *   of its bytes, so a changed sprite changes only its own pack's name.
 * - Cell packs, one per cell, with exactly the sprites of that cell's
 *   selector. They serve a cell opened before its bulk pack arrives: one
 *   request for the bytes that single files would bring. All share one hash
 *   of their bytes.
 *
 * The build fails when a catalog sprite has no file, is not a PNG, or is in
 * no bulk pack. A new sprite needs only its PNG and its catalog entry.
 *
 * `vite dev` and Vitest get no packs: the Picker loads single files there, as
 * it did before packs, so the dev server stays fast to start.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runnerImport, type Plugin } from 'vite';
import type { PackManifest } from '../src/favorites/model/spritePacks';

type Plan = typeof import('../src/favorites/model/spritePacks');

const PLAN = 'src/favorites/model/spritePacks.ts';
/** Larger bulk packs are split, so one pack never holds a slow connection for long. */
const PACK_BYTES = 250 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Emitted { fileName: string; source: Uint8Array }

const hash = (...parts: Uint8Array[]) => {
  const h = createHash('sha256');
  for (const part of parts) h.update(part);
  return h.digest('hex').slice(0, 12);
};

/** The header (count, then each length) and the files, as one buffer. */
function pack(files: Buffer[]): Buffer {
  const header = Buffer.alloc(4 + 4 * files.length);
  header.writeUInt32LE(files.length, 0);
  files.forEach((file, i) => header.writeUInt32LE(file.length, 4 + 4 * i));
  return Buffer.concat([header, ...files]);
}

export function buildPacks(root: string, base: string, plan: Plan): { manifest: PackManifest; files: Emitted[] } {
  const bytes = new Map<string, Buffer>();
  const read = (sprite: string): Buffer => {
    let file = bytes.get(sprite);
    if (file) return file;
    const source = path.join(root, 'public', sprite.split('?')[0]);
    if (!fs.existsSync(source)) throw new Error(`picker-sprite-packs: ${sprite} is in the Picker catalog, but ${path.relative(root, source)} does not exist.`);
    file = fs.readFileSync(source);
    if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`picker-sprite-packs: ${path.relative(root, source)} is not a PNG file.`);
    bytes.set(sprite, file);
    return file;
  };

  const files: Emitted[] = [];
  const packs: PackManifest['packs'] = [];
  const groups = plan.bulkGroups();
  const packed = new Set<string>();
  groups.forEach((group, index) => {
    let part: string[] = [];
    let size = 0;
    const flush = () => {
      if (!part.length) return;
      const source = pack(part.map(read));
      const fileName = `sprites/packs/picker-sprites-${hash(source)}.bin`;
      files.push({ fileName, source });
      packs.push({ url: `${base}${fileName}`, group: index, count: part.length });
      part = [];
      size = 0;
    };
    for (const sprite of group) {
      if (packed.has(sprite)) throw new Error(`picker-sprite-packs: ${sprite} is in two bulk packs.`);
      packed.add(sprite);
      const length = read(sprite).length;
      if (part.length && size + length > PACK_BYTES) flush();
      part.push(sprite);
      size += length;
    }
    flush();
  });
  if (packs.filter((p) => p.group === 0).length !== 1) throw new Error('picker-sprite-packs: the first cell no longer fits in one pack. Raise PACK_BYTES or pick a smaller first cell.');

  // The first cell's pack is bulk pack 0, so it is fetched once, whichever asks first.
  const cells = plan.packedCells().filter(({ type, gen }) => !(type === plan.FIRST_CELL.type && gen === plan.FIRST_CELL.gen));
  const cellFiles = cells.map(({ type, gen }) => {
    const sprites = plan.cellSprites(type, gen);
    for (const sprite of sprites) {
      if (!packed.has(sprite)) throw new Error(`picker-sprite-packs: ${sprite} shows in ${type} / ${gen} but is in no bulk pack.`);
    }
    return { name: plan.cellPackName(type, gen), source: pack(sprites.map(read)) };
  });
  const cellHash = hash(...cellFiles.flatMap((cell) => [Buffer.from(cell.name), cell.source]));
  const cellPrefix = `sprites/packs/picker-cell-${cellHash}-`;
  for (const cell of cellFiles) files.push({ fileName: `${cellPrefix}${cell.name}`, source: cell.source });

  return { manifest: { packs, cells: `${base}${cellPrefix}` }, files };
}

export function pickerSpritePacks(): Plugin {
  let files: Emitted[] = [];
  return {
    name: 'picker-sprite-packs',
    async config(config, { command }) {
      if (command !== 'build' || config.build?.ssr) return { define: { __PICKER_SPRITE_PACKS__: 'null' } };
      const root = path.resolve(config.root ?? process.cwd());
      const { module: plan } = await runnerImport<Plan>(path.join(root, PLAN), {
        configFile: false,
        root,
        logLevel: 'error',
        resolve: { alias: config.resolve?.alias },
      });
      const built = buildPacks(root, config.base ?? '/', plan);
      files = built.files;
      return { define: { __PICKER_SPRITE_PACKS__: JSON.stringify(built.manifest) } };
    },
    generateBundle() {
      for (const file of files) this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
    },
  };
}
