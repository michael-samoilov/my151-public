#!/usr/bin/env node
/**
 * Enforces two testing rules from AGENTS.md section 4, "Testing".
 *
 *   node scripts/check-test-rules.mjs
 *
 * 1. A new unit test needs a reason to exist. A unit test file
 *    (`src/**\/*.test.ts(x)`, `scripts/**\/*.test.ts`) that is new since the
 *    base commit fails unless it sits in a keep area, or one of its first 5
 *    lines is a `// keeps: <bug E2E misses>` comment. A file is in a keep area
 *    when one of these holds:
 *    - It lives under `scripts/`, or an import resolves into `api/` or
 *      `scripts/`. E2E stubs every API route and never runs the build gates.
 *    - Its path or an import specifier contains `store`, `persist`, or
 *      `migrat`. That is saved-data shape and migrations.
 * 2. A proof test is never committed. Any `.spec` or `.test` file whose name
 *    starts with `proof-` or `zz-proof`, or that contains a `// proof:`
 *    comment, fails. This rule reads every file in the tree, not only new ones.
 *
 * "New" compares the working tree, untracked files included, with the merge
 * base of HEAD and origin/claude/pokedex-region-builder-AviYF. Without that
 * ref, the base is HEAD~1. Without HEAD~1, rule 1 is skipped with a message.
 * A renamed or moved test is not new.
 *
 * Imports are found by regex, not a parser: static `import … from`, bare
 * `import '…'`, `export … from`, `import('…')`, and `vi.mock('…')`. Relative
 * specifiers and the `@/` alias are resolved to repository paths.
 */
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

/** The commit that "new" is measured from, and how it was chosen. */
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

/** Import specifiers in `text`, resolved to repository paths where possible. */
function imports(file, text) {
  return IMPORTS.flatMap((re) => [...text.matchAll(re)].map((m) => m[2])).map((spec) => {
    if (spec.startsWith('.')) return { spec, path: posix.normalize(posix.join(posix.dirname(file), spec)) };
    if (spec.startsWith('@/')) return { spec, path: `src/${spec.slice(2)}` };
    return { spec, path: null };
  });
}

/** Why `file` may be a unit test without a `// keeps:` line, or null. */
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

// Rule 1: new unit tests.
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

// Rule 2: committed proof tests.
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
