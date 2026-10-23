import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { fingerprint, makeReceipt, validateReceipt } from './artifact';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ci-artifact-'));
  temporary.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, 'input.ts'), 'source');
  const runDir = join(root, '.git/ci-runs/current');
  mkdirSync(join(runDir, 'dist/.vite'), { recursive: true });
  writeFileSync(join(runDir, 'dist/.vite/manifest.json'), '{}');
  writeFileSync(join(runDir, 'dist/index.html'), 'output');
  return { root, runDir };
}

test('untracked and dirty build inputs invalidate a receipt but operational files do not', () => {
  const { root, runDir } = fixture();
  const identity = fingerprint(root);
  makeReceipt(root, runDir, 'current', identity);
  expect(() => validateReceipt(root, runDir, 'current')).not.toThrow();
  writeFileSync(join(runDir, 'stage.log'), 'operational output');
  expect(fingerprint(root)).toBe(identity);
  writeFileSync(join(root, 'input.ts'), 'changed source');
  expect(() => validateReceipt(root, runDir, 'current')).toThrow(/input/i);
});

test('a stale run marker and a modified output cannot be served as current evidence', () => {
  const { root, runDir } = fixture();
  makeReceipt(root, runDir, 'current', fingerprint(root));
  expect(() => validateReceipt(root, runDir, 'old-run')).toThrow(/run/i);
  writeFileSync(join(runDir, 'dist/index.html'), 'tampered output');
  expect(() => validateReceipt(root, runDir, 'current')).toThrow(/output/i);
});

test('a changed build environment invalidates evidence without recording plaintext values', () => {
  const { root, runDir } = fixture();
  const previous = process.env.VITE_CI_RECEIPT_CHECK;
  try {
    process.env.VITE_CI_RECEIPT_CHECK = 'first';
    makeReceipt(root, runDir, 'current', fingerprint(root));
    process.env.VITE_CI_RECEIPT_CHECK = 'second';
    expect(() => validateReceipt(root, runDir, 'current')).toThrow(/input/i);
  } finally {
    if (previous === undefined) delete process.env.VITE_CI_RECEIPT_CHECK;
    else process.env.VITE_CI_RECEIPT_CHECK = previous;
  }
});
