import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { dropTypecheckStateAfterDependencyChange, eslintCacheArgs } from './cache';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function checkout() {
  const root = mkdtempSync(join(tmpdir(), 'ci-cache-'));
  temporary.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, 'node_modules', '.tmp'), { recursive: true });
  writeFileSync(join(root, 'package-lock.json'), '{"packages":{}}');
  return root;
}
const install = (root: string, tree: string) => writeFileSync(join(root, 'node_modules', '.package-lock.json'), tree);
const saveState = (root: string) => writeFileSync(join(root, 'node_modules', '.tmp', 'tsconfig.app.tsbuildinfo'), '{}');
const hasState = (root: string) => existsSync(join(root, 'node_modules', '.tmp', 'tsconfig.app.tsbuildinfo'));

test('an install that changes packages drops saved type-check state, so tsc -b cannot skip new package type errors', () => {
  const root = checkout();
  install(root, '{"d3-scale":"4.0.0"}');
  dropTypecheckStateAfterDependencyChange(root);
  saveState(root);
  install(root, '{"d3-scale":"4.0.2"}');
  expect(dropTypecheckStateAfterDependencyChange(root)).toBe(true);
  expect(hasState(root)).toBe(false);
});

test('an unchanged install keeps saved type-check state, so a repeat run stays incremental', () => {
  const root = checkout();
  install(root, '{"d3-scale":"4.0.0"}');
  dropTypecheckStateAfterDependencyChange(root);
  saveState(root);
  expect(dropTypecheckStateAfterDependencyChange(root)).toBe(false);
  expect(hasState(root)).toBe(true);
});

test('a checkout without npm\'s hidden lockfile still keys on package-lock.json', () => {
  const root = checkout();
  saveState(root);
  expect(dropTypecheckStateAfterDependencyChange(root)).toBe(true);
  saveState(root);
  expect(dropTypecheckStateAfterDependencyChange(root)).toBe(false);
  expect(hasState(root)).toBe(true);
});

test('a parser or plugin upgrade moves lint to a new cache file and deletes the old one', () => {
  const root = checkout();
  install(root, '{"typescript-eslint":"8.57.2"}');
  const before = eslintCacheArgs(root).at(-1)!;
  writeFileSync(before, '{}');
  install(root, '{"typescript-eslint":"8.72.1"}');
  const after = eslintCacheArgs(root).at(-1)!;
  expect(after).not.toBe(before);
  expect(readdirSync(join(root, '.git', 'ci-cache'))).not.toContain(before.split('/').at(-1));
});
