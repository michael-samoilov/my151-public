import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let restore = false;
let batch = '2026-10-18';
let selected = false;
while (args.length) {
  const option = args.shift();
  if (option === '--restore' && !restore) restore = true;
  else if (option === '--batch' && !selected && /^[a-z0-9][a-z0-9-]*$/.test(args[0] ?? '')) {
    batch = args.shift();
    selected = true;
  } else throw new Error('Usage: node scripts/evidence-archive.mjs [--restore] [--batch ID]');
}
const manifest = JSON.parse(readFileSync(join(root, `docs/evidence/archive/${batch}.json`), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !Array.isArray(manifest.files) || !manifest.files.length) {
  throw new Error('Invalid archive manifest.');
}
const paths = new Set();
for (const file of manifest.files) {
  if (typeof file.path !== 'string' || !file.path.startsWith('docs/') || (file.path.includes('\\') || [...file.path].some(char => char.charCodeAt(0) < 32)) || file.path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(file.path) || !/^[a-f0-9]{40}$/.test(file.blob) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.mode !== '100644') {
    throw new Error('Invalid archive entry.');
  }
  paths.add(file.path);
}
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const entries = new Map(git(['ls-tree', '-rz', manifest.sourceCommit, '--', 'docs']).toString().split('\0').filter(Boolean).map(line => {
  const [header, path] = line.split('\t');
  const [mode, , blob] = header.split(' ');
  return [path, { mode, blob }];
}));
for (const file of manifest.files) {
  const entry = entries.get(file.path);
  if (entry?.blob !== file.blob || entry.mode !== file.mode) {
    throw new Error(`Archive entry differs from its source tree: ${file.path}`);
  }
}
function verifiedBlob(file) {
  const bytes = git(['cat-file', 'blob', file.blob]);
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Archive bytes differ from the manifest: ${file.path}`);
  }
  return bytes;
}
for (const file of manifest.files) verifiedBlob(file);
const destination = join(root, '.audit', `evidence-archive-${batch === '2026-10-18' ? '' : batch + '-'}${manifest.sourceCommit.slice(0, 8)}`);
if (restore) {
  mkdirSync(dirname(destination), { recursive: true });
  mkdirSync(destination);
  for (const file of manifest.files) {
    const path = join(destination, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, verifiedBlob(file), { flag: 'wx', mode: 0o644 });
  }
}
console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, batch, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), restoredTo: restore ? destination : null }, null, 2));
