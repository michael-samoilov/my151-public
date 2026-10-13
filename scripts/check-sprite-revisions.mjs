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
 * Also fails when a Pokémon sprite was added or replaced since production
 * without a row in `src/data/spriteAttribution.json`, which names the artists
 * the Acknowledgements panel credits for it, and when a row names a sprite
 * that does not exist.
 *
 * Usage: node scripts/check-sprite-revisions.mjs [base-ref]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'origin/claude/pokedex-region-builder-AviYF';
const REVISIONS = 'src/data/spriteRevisions.json';
const SOURCES = 'src/data/spriteAttribution.json';
const revisions = JSON.parse(readFileSync(REVISIONS, 'utf8'));
const sources = JSON.parse(readFileSync(SOURCES, 'utf8')).sprites;
const shortHash = (file) => createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 8);
const problems = [];

for (const [path, revision] of Object.entries(revisions)) {
  const file = `public${path}`;
  if (!existsSync(file)) problems.push(`${path} is in ${REVISIONS}, but ${file} does not exist.`);
  else if (shortHash(file) !== revision) problems.push(`${path}: set its entry in ${REVISIONS} to "${shortHash(file)}" (now "${revision}").`);
}

for (const sprite of Object.keys(sources)) {
  if (!existsSync(`public/sprites/pokemon/${sprite}.png`)) problems.push(`${SOURCES} names "${sprite}", but public/sprites/pokemon/${sprite}.png does not exist.`);
}

const changedSince = (filter) => execFileSync('git', ['diff', '--name-only', `--diff-filter=${filter}`, BASE, '--', 'public/sprites'], { encoding: 'utf8' })
  .split('\n').filter(Boolean);
let replaced = [];
let added = [];
try {
  replaced = changedSince('M');
  added = changedSince('A');
} catch {
  console.warn(`check-sprite-revisions: ${BASE} is not available, so only the entries were checked.`);
}
for (const file of replaced) {
  const path = file.slice('public'.length);
  if (revisions[path] === undefined) problems.push(`${path} was replaced since ${BASE}. Add "${path}": "${shortHash(file)}" to ${REVISIONS}.`);
}
for (const file of [...replaced, ...added]) {
  const sprite = /^public\/sprites\/pokemon\/([^/]+)\.png$/.exec(file)?.[1];
  if (sprite !== undefined && sources[sprite] === undefined) {
    problems.push(`${file} was ${replaced.includes(file) ? 'replaced' : 'added'} since ${BASE}. Add "${sprite}": { "artists": ["<artist>"], "role": "drew", "via": "<project id or own upload>" } to "sprites" in ${SOURCES}.`);
  }
}

if (problems.length) {
  console.error(`check-sprite-revisions: ${problems.length} problem(s). Browsers keep a replaced sprite until its URL changes.`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check-sprite-revisions: ${replaced.length} sprite(s) replaced since ${BASE}, ${Object.keys(revisions).length} revision entr${Object.keys(revisions).length === 1 ? 'y' : 'ies'}, all current.`);
