#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { decode, samePixels } from './png-rgba.ts';

const BASE = process.argv[2] ?? 'origin/claude/pokedex-region-builder-AviYF';
const REVISIONS = 'src/data/spriteRevisions.json';
const SOURCES = 'src/data/spriteAttribution.json';
const REENCODES = 'scripts/sprite-reencodes.json';
const revisions = JSON.parse(readFileSync(REVISIONS, 'utf8'));
const sources = JSON.parse(readFileSync(SOURCES, 'utf8')).sprites;
const reencodes = existsSync(REENCODES) ? JSON.parse(readFileSync(REENCODES, 'utf8')) : {};
const shortHash = (file) => createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 8);
const problems = [];

for (const [path, revision] of Object.entries(revisions)) {
  const file = `public${path}`;
  if (!existsSync(file)) problems.push(`${path} is in ${REVISIONS}, but ${file} does not exist.`);
  else if (shortHash(file) !== revision) problems.push(`${path}: set its entry in ${REVISIONS} to "${shortHash(file)}" (now "${revision}").`);
}

for (const [path, hash] of Object.entries(reencodes)) {
  const file = `public${path}`;
  if (!existsSync(file) || shortHash(file) !== hash) problems.push(`${path} changed after its lossless re-encode. Delete its entry from ${REENCODES}.`);
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
const atBase = (file) => execFileSync('git', ['show', `${BASE}:${file}`], { maxBuffer: 1 << 26 });
const looksSameAsBase = (file) => {
  try { return samePixels(decode(atBase(file)), decode(readFileSync(file))); } catch { return false; }
};
const reencoded = replaced.filter((file) => reencodes[file.slice('public'.length)] === shortHash(file) && looksSameAsBase(file));
replaced = replaced.filter((file) => !reencoded.includes(file));
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
console.log(`check-sprite-revisions: ${replaced.length} sprite(s) replaced and ${reencoded.length} losslessly re-encoded since ${BASE}, ${Object.keys(revisions).length} revision entr${Object.keys(revisions).length === 1 ? 'y' : 'ies'}, all current.`);
