#!/usr/bin/env node
/**
 * Sprites are served `immutable` for a year and the service worker keeps them
 * forever, so a sprite replaced under the same name never reaches a browser
 * that already holds it. Zacian and Zamazenta showed their Crowned art for both
 * forms that way.
 *
 * Fails when a file under public/sprites differs from production without a
 * `src/data/spriteRevisions.json` entry for its current content, and when an
 * entry no longer matches its file. `src/lib/spriteUrl.ts` sends the entry as
 * `?v=`, which every cache treats as a new file.
 *
 * Usage: node scripts/check-sprite-revisions.mjs [base-ref]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'origin/claude/pokedex-region-builder-AviYF';
const REVISIONS = 'src/data/spriteRevisions.json';
const revisions = JSON.parse(readFileSync(REVISIONS, 'utf8'));
const shortHash = (file) => createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 8);
const problems = [];

for (const [path, revision] of Object.entries(revisions)) {
  const file = `public${path}`;
  if (!existsSync(file)) problems.push(`${path} is in ${REVISIONS}, but ${file} does not exist.`);
  else if (shortHash(file) !== revision) problems.push(`${path}: set its entry in ${REVISIONS} to "${shortHash(file)}" (now "${revision}").`);
}

let replaced = [];
try {
  replaced = execFileSync('git', ['diff', '--name-only', '--diff-filter=M', BASE, '--', 'public/sprites'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
} catch {
  console.warn(`check-sprite-revisions: ${BASE} is not available, so only the entries were checked.`);
}
for (const file of replaced) {
  const path = file.slice('public'.length);
  if (revisions[path] === undefined) problems.push(`${path} was replaced since ${BASE}. Add "${path}": "${shortHash(file)}" to ${REVISIONS}.`);
}

if (problems.length) {
  console.error(`check-sprite-revisions: ${problems.length} problem(s). Browsers keep a replaced sprite until its URL changes.`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check-sprite-revisions: ${replaced.length} sprite(s) replaced since ${BASE}, ${Object.keys(revisions).length} revision entr${Object.keys(revisions).length === 1 ? 'y' : 'ies'}, all current.`);
