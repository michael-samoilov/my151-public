import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const restore = process.argv[2] === '--restore';
if (process.argv.length > (restore ? 3 : 2)) throw new Error('Usage: node scripts/evidence-archive.mjs [--restore]');
const manifest = JSON.parse(readFileSync(join(root, 'docs/evidence/archive/2026-10-18.json'), 'utf8'));
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const entries = new Map(git(['ls-tree', '-r', manifest.sourceCommit, '--', 'docs/evidence']).toString().trim().split('\n').map(line => {
  const [header, path] = line.split('\t');
  const [mode, , blob] = header.split(' ');
  return [path, { mode, blob }];
}));
const verified = manifest.files.map(file => {
  const entry = entries.get(file.path);
  if (!file.path.startsWith('docs/evidence/') || file.path.split('/').includes('..') || entry?.mode !== '100644' || entry.blob !== file.blob || entry.mode !== file.mode) {
    throw new Error(`Archive entry differs from its source tree: ${file.path}`);
  }
  const bytes = git(['cat-file', 'blob', file.blob]);
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Archive bytes differ from the manifest: ${file.path}`);
  }
  return { file, bytes };
});
const destination = join(root, '.audit', `evidence-archive-${manifest.sourceCommit.slice(0, 8)}`);
if (restore) {
  mkdirSync(dirname(destination), { recursive: true });
  mkdirSync(destination);
  for (const { file, bytes } of verified) {
    const path = join(destination, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o644 });
  }
}
console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, files: verified.length, bytes: verified.reduce((sum, item) => sum + item.bytes.length, 0), restoredTo: restore ? destination : null }, null, 2));
