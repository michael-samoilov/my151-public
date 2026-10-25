#!/usr/bin/env node
/**
 * A shiny sprite shows the same art as its normal sprite in other colors, so
 * the two have the same outline. A shiny drawn from another design does not:
 * Terapagos Stellar's shiny showed an older form than its normal sprite.
 *
 * Fails when a file under public/sprites/pokemon/shiny/ has no normal sprite of
 * the same name, when its alpha mask differs from that normal sprite's in any
 * pixel, and when `src/data/shinySprites.json` and the folder list different
 * files. `scripts/fetch-shiny-sprites.ts` applies the same test, deletes a
 * shiny that fails it, and rewrites the list.
 *
 * Usage: node scripts/check-shiny-masks.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { decode, maskDifference } from './png-rgba.ts';

const NORMAL = 'public/sprites/pokemon';
const SHINY = `${NORMAL}/shiny`;
const LIST = 'src/data/shinySprites.json';
const files = readdirSync(SHINY).filter((name) => name.endsWith('.png')).map((name) => name.slice(0, -'.png'.length));
const listed = new Set(JSON.parse(readFileSync(LIST, 'utf8')).map(String));
const problems = [];

for (const name of files) {
  const normal = `${NORMAL}/${name}.png`;
  if (!existsSync(normal)) {
    problems.push(`${SHINY}/${name}.png has no normal sprite ${normal}.`);
    continue;
  }
  const difference = maskDifference(decode(readFileSync(`${SHINY}/${name}.png`)), decode(readFileSync(normal)));
  if (difference === null) problems.push(`${SHINY}/${name}.png is not the size of ${normal}.`);
  else if (difference > 0) problems.push(`${SHINY}/${name}.png: its outline differs from ${normal} in ${difference} pixel${difference === 1 ? '' : 's'}.`);
}
for (const name of files) if (!listed.has(name)) problems.push(`${SHINY}/${name}.png is missing from ${LIST}.`);
for (const name of listed) if (!files.includes(name)) problems.push(`${LIST} lists ${name}, but ${SHINY}/${name}.png does not exist.`);

if (problems.length) {
  console.error(`check-shiny-masks: ${problems.length} problem(s). Rerun npx tsx scripts/fetch-shiny-sprites.ts, which drops a shiny whose outline differs.`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check-shiny-masks: ${files.length} shiny sprites, each with its normal sprite's outline.`);
