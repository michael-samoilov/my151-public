import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface BuildReceipt {
  runId: string;
  source: string;
  dist: string;
  output: string;
}

export function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

export function fingerprint(root: string): string {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of readdirSync(root)) if (/^\.env(?:\.|$)/.test(name)) files.push(name);
  const hash = createHash('sha256').update(process.version);
  for (const name of [...new Set(files)].sort()) {
    if (/^(?:\.audit\/|node_modules\/|dist\/|test-results\/|playwright-report\/|scripts\/ci\/test-map\.json$)/.test(name)) continue;
    const path = join(root, name);
    hash.update(name).update('\0');
    if (!existsSync(path)) { hash.update('deleted'); continue; }
    const stat = lstatSync(path);
    hash.update(String(stat.mode));
    if (stat.isSymbolicLink()) hash.update(readlinkSync(path));
    else if (stat.isFile()) hash.update(readFileSync(path));
  }
  for (const name of ['vite', 'typescript', '@playwright/test', 'tsx']) {
    const path = join(root, 'node_modules', name, 'package.json');
    hash.update(existsSync(path) ? readFileSync(path) : `${name}:missing`);
  }
  hash.update(execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim());
  const buildEnvironment = Object.entries(process.env).filter(([name]) => /^(?:VITE_|VERCEL_|SOURCE_DATE_EPOCH$|NODE_ENV$)/.test(name)).sort(([a], [b]) => a.localeCompare(b));
  return hash.update(JSON.stringify(buildEnvironment)).digest('hex');
}

function outputFingerprint(directory: string): string {
  const hash = createHash('sha256');
  function visit(path: string, prefix: string) {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      const relative = `${prefix}/${name}`;
      if (lstatSync(child).isDirectory()) visit(child, relative);
      else hash.update(relative).update('\0').update(readFileSync(child));
    }
  }
  visit(directory, '');
  return hash.digest('hex');
}

export function makeReceipt(root: string, directory: string, runId: string, source: string): BuildReceipt {
  if (fingerprint(root) !== source) throw new Error('Source inputs changed during the build.');
  const dist = resolve(directory, 'dist');
  if (!existsSync(join(dist, '.vite/manifest.json'))) throw new Error('Build output has no manifest.');
  const receipt = { runId, source, dist, output: outputFingerprint(dist) };
  atomicJson(join(directory, 'build-receipt.json'), receipt);
  return receipt;
}

export function validateReceipt(root: string, directory: string, runId: string): BuildReceipt {
  const receipt: BuildReceipt = JSON.parse(readFileSync(join(directory, 'build-receipt.json'), 'utf8'));
  if (receipt.runId !== runId || receipt.dist !== resolve(directory, 'dist')) throw new Error('Build receipt belongs to another run.');
  if (receipt.source !== fingerprint(root)) throw new Error('Source inputs no longer match the build receipt.');
  if (receipt.output !== outputFingerprint(receipt.dist)) throw new Error('Build output no longer matches the receipt.');
  return receipt;
}
