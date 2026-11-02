#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION = 'origin/claude/pokedex-region-builder-AviYF';
const RULES = 'See AGENTS.md section 4, "Testing". Annotate a kept unit test with `// keeps: <bug E2E misses>` in its first 5 lines.';

const UNIT_TEST = /^(?:src\/.+\.test\.tsx?|scripts\/.+\.test\.ts)$/;
const ANY_TEST = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const KEEPS = /^\s*\/\/\s*keeps:\s*\S/;
const PROOF_MARKER = /\/\/\s*proof:/;
const SAVED_DATA = /store|persist|migrat/i;
const IMPORTS = [
  /^\s*(?:import|export)\s[^;]*?\bfrom\s*(['"])([^'"\n]+)\1/gm,
  /^\s*import\s*(['"])([^'"\n]+)\1/gm,
  /\bimport\s*\(\s*(['"])([^'"\n]+)\1/g,
  /\bvi\.(?:mock|doMock|importActual)\s*\(\s*(['"])([^'"\n]+)\1/g,
];

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const paths = (out) => (out ?? '').split('\0').filter((p) => p && existsSync(join(root, p)));

function baseCommit() {
  if (git('rev-parse', '--verify', '--quiet', `${PRODUCTION}^{commit}`)) {
    const base = git('merge-base', 'HEAD', PRODUCTION)?.trim();
    if (base) return { base, label: `the merge base with ${PRODUCTION}` };
  }
  if (git('rev-parse', '--verify', '--quiet', 'HEAD~1^{commit}')) {
    return { base: 'HEAD~1', label: `HEAD~1 (${PRODUCTION} is missing)` };
  }
  return null;
}

function imports(file, text) {
  return IMPORTS.flatMap((re) => [...text.matchAll(re)].map((m) => m[2])).map((spec) => {
    if (spec.startsWith('.')) return { spec, path: posix.normalize(posix.join(posix.dirname(file), spec)) };
    if (spec.startsWith('@/')) return { spec, path: `src/${spec.slice(2)}` };
    return { spec, path: null };
  });
}

function keepArea(file, text) {
  if (file.startsWith('scripts/')) return 'lives under scripts/';
  if (SAVED_DATA.test(file)) return 'saved-data path';
  for (const { spec, path } of imports(file, text)) {
    if (path && /^(?:api|scripts)\//.test(path)) return `imports ${spec}`;
    if (SAVED_DATA.test(spec)) return `imports ${spec}`;
  }
  return null;
}

const problems = [];
const read = (file) => readFileSync(join(root, file), 'utf8');

const found = baseCommit();
let newTests = [];
if (found) {
  const added = paths(git('diff', '--name-only', '--diff-filter=A', '-M', '-z', found.base));
  const untracked = paths(git('ls-files', '--others', '--exclude-standard', '-z'));
  newTests = [...new Set([...added, ...untracked])].filter((p) => UNIT_TEST.test(p)).sort();
  for (const file of newTests) {
    const text = read(file);
    if (keepArea(file, text)) continue;
    if (text.split('\n').slice(0, 5).some((line) => KEEPS.test(line))) continue;
    problems.push(`${file}: new unit test outside the keep areas (api/, scripts/, saved data) with no \`// keeps:\` line in its first 5 lines.`);
  }
} else {
  console.log(`check-test-rules: no ${PRODUCTION} and no HEAD~1, so the new-unit-test rule is skipped.`);
}

const allTests = paths(git('ls-files', '--cached', '--others', '--exclude-standard', '-z')).filter((p) => ANY_TEST.test(p));
for (const file of allTests) {
  const name = basename(file);
  if (name.startsWith('proof-') || name.startsWith('zz-proof')) {
    problems.push(`${file}: proof test by name. Delete it before you commit.`);
  } else if (PROOF_MARKER.test(read(file))) {
    problems.push(`${file}: proof test by \`// proof:\` marker. Delete it before you commit.`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(RULES);
  process.exit(1);
}
const since = found ? `${newTests.length} new unit test file(s) since ${found.label}, each kept or annotated` : 'new-unit-test rule skipped';
console.log(`check-test-rules: ${since}; no proof tests in ${allTests.length} test file(s).`);
