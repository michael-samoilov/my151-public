import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// npm rewrites its hidden lockfile on every install that changes the tree, so it identifies the installed packages.
export function installedDependencyKey(root: string): string {
  const hidden = join(root, 'node_modules', '.package-lock.json');
  const lockfile = existsSync(hidden) ? hidden : join(root, 'package-lock.json');
  return createHash('sha256').update(readFileSync(lockfile)).digest('hex').slice(0, 16);
}

// `tsc -b` treats a project as up to date when its own files are older than its saved state.
// It never compares package type files, so after an install it can skip type errors that new package types cause.
export function dropTypecheckStateAfterDependencyChange(root: string): boolean {
  const directory = join(root, 'node_modules', '.tmp');
  const record = join(directory, 'my151-dependencies.key');
  const key = installedDependencyKey(root);
  if (existsSync(record) && readFileSync(record, 'utf8') === key) return false;
  mkdirSync(directory, { recursive: true });
  for (const name of readdirSync(directory)) if (name.endsWith('.tsbuildinfo')) rmSync(join(directory, name));
  writeFileSync(record, key);
  return true;
}

// No lint rule here reads type information from other files, so a file whose content is unchanged keeps its result.
// The installed-dependency key in the name starts a new cache after a parser or plugin upgrade.
export function eslintCacheArgs(root: string): string[] {
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  const directory = join(gitDirectory, 'ci-cache');
  const name = `eslint-${installedDependencyKey(root)}.json`;
  mkdirSync(directory, { recursive: true });
  for (const old of readdirSync(directory)) if (/^eslint-.*\.json$/.test(old) && old !== name) rmSync(join(directory, old));
  return ['--cache', '--cache-strategy', 'content', '--cache-location', join(directory, name)];
}
