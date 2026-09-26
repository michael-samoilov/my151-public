#!/usr/bin/env node
/**
 * Fails when a Playwright spec skips the `desktop` project outside a test or
 * describe tagged `@viewport`.
 *
 *   node scripts/check-viewport-tags.mjs
 *
 * `playwright.config.ts` runs every test in `desktop`, and only `@viewport`
 * tests in `mobile` and `narrow`. An untagged test that skips `desktop` so
 * runs in no project at all, and Playwright reports nothing. This finds the
 * skips that exclude `desktop` and checks that an enclosing test or describe
 * carries the tag.
 *
 * It is a text heuristic, not a parser:
 *
 * - A skip is a `test.skip(`, `test.fixme(`, `testInfo.skip(` or `info.skip(`
 *   call. Only its first argument, the condition, is read.
 * - The condition excludes `desktop` when one of its comparisons is true for
 *   the desktop project: `project.name === 'desktop'` or `!== 'mobile'`, a
 *   width compared so that 1280 passes (`width >= 1024`), a negated
 *   `isMobile` or `hasTouch`, or a bare `desktop` or `md` flag.
 * - The enclosing blocks are found by indentation: each earlier line indented
 *   less than the current one opens the block around it. Formatted code holds
 *   that; a skip inside an early `return` branch is not seen.
 *
 * Specs under e2e/sweeps/ and e2e/dev/ are skipped: they are not in the
 * `mobile` or `narrow` projects.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const E2E = join(root, 'e2e');
const EXCLUDED_DIRS = new Set(['sweeps', 'dev']);
const TAG = '@viewport';

/** The desktop project, as the conditions see it. */
const DESKTOP = { name: 'desktop', width: 1280 };

const SKIP_CALL = /\b(?:test|testInfo|info|test\.info\(\))\.(?:skip|fixme)\(/;
const DECLARATION = /\btest(?:\.describe(?:\.(?:serial|parallel|only))?|\.only)?\(/;

function specFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return EXCLUDED_DIRS.has(entry.name) ? [] : specFiles(join(dir, entry.name));
    }
    return entry.name.endsWith('.spec.ts') ? [join(dir, entry.name)] : [];
  });
}

const indentOf = (line) => /^\s*/.exec(line)[0].length;

/** The text with every string literal's contents replaced by `_`, same length. */
function maskStrings(text) {
  return text.replace(
    /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g,
    (s) => s[0] + '_'.repeat(s.length - 2) + s[0],
  );
}

/**
 * The first argument of the call whose `(` is the first character of `rest`,
 * both as written and with its strings masked.
 */
function firstArgument(rest) {
  const raw = rest.slice(0, 2000);
  const masked = maskStrings(raw);
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    if (depth === 0 || (c === ',' && depth === 1)) {
      return { raw: raw.slice(1, i), masked: masked.slice(1, i) };
    }
  }
  return { raw: raw.slice(1), masked: masked.slice(1) };
}

const OPERATORS = {
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '<': (a, b) => a < b,
  '===': (a, b) => a === b,
  '==': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '!=': (a, b) => a !== b,
};
const compare = (a, op, b) => OPERATORS[op](a, b);

/** The comparisons in a skip condition that hold for the desktop project. */
function desktopExclusions({ raw, masked }) {
  const hits = [];
  for (const m of raw.matchAll(/project\.name\s*(===|!==|==|!=)\s*['"](\w+)['"]/g)) {
    if (compare(DESKTOP.name, m[1], m[2])) hits.push(m[0]);
  }
  for (const m of masked.matchAll(/\bwidth\b[^,;&|<>=!]*?(>=|<=|>|<)\s*(\d+)/g)) {
    if (compare(DESKTOP.width, m[1], Number(m[2]))) hits.push(m[0]);
  }
  for (const m of masked.matchAll(/(\d+)\s*(>=|<=|>|<)\s*[\w?.()!]*\bwidth\b/g)) {
    if (compare(Number(m[1]), m[2], DESKTOP.width)) hits.push(m[0]);
  }
  for (const m of masked.matchAll(/!\s*(?:[\w?]+\.)*(?:isMobile|hasTouch)\b/g)) hits.push(m[0]);
  for (const m of masked.matchAll(/(?<![!.\w])(?:desktop|isDesktop|md|isMd)\b(?!\s*[:(])/g)) hits.push(m[0]);
  return hits;
}

/** The declaration heads enclosing line `index`, innermost first. */
function enclosingDeclarations(lines, index) {
  const heads = [];
  let limit = indentOf(lines[index]);
  for (let i = index - 1; i >= 0 && limit > 0; i -= 1) {
    if (lines[i].trim() === '' || indentOf(lines[i]) >= limit) continue;
    limit = indentOf(lines[i]);
    if (!DECLARATION.test(lines[i])) continue;
    // A head can wrap: read on to the line that opens the callback.
    let end = i;
    while (end < lines.length - 1 && end < i + 5 && !lines[end].includes('=>')) end += 1;
    heads.push({ line: i + 1, head: lines.slice(i, end + 1).join('\n') });
  }
  return heads;
}

const problems = [];
let found = 0;
for (const file of specFiles(E2E)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const call = SKIP_CALL.exec(line);
    if (!call) return;
    const rest = [line.slice(call.index + call[0].length - 1), ...lines.slice(i + 1, i + 10)].join('\n');
    const hits = desktopExclusions(firstArgument(rest));
    if (hits.length === 0) return;
    found += 1;
    const heads = enclosingDeclarations(lines, i);
    if (heads.some((d) => d.head.includes(TAG))) return;
    const why = heads.length > 0
      ? `the test or describe at line ${heads[0].line} is not tagged ${TAG}`
      : `it sits outside any test or describe, where no tag reaches it`;
    problems.push(`${relative(root, file)}:${i + 1}: skips desktop (${hits.join('; ')}), but ${why}.`);
  });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(
    `\n${problems.length} skip(s) exclude the desktop project outside a ${TAG} test. ` +
      `mobile and narrow run only ${TAG} tests, so these run in no project. ` +
      `Add { tag: '${TAG}' } to the enclosing test or describe.`,
  );
  process.exit(1);
}
console.log(`check-viewport-tags: ${found} skip(s) exclude desktop, and each sits in a ${TAG} test or describe.`);
