#!/usr/bin/env node
/**
 * Fails when the published source of the hover-tilt files drifts from the
 * files the app builds from.
 *
 * hover-tilt's package states MPL-2.0. MPL-2.0 section 3.2(a) asks that each
 * file holding its code be available as source to the people who get the
 * app, so src/components/export/hover-tilt/ holds that code and nothing of
 * my151's, and public/licenses/source/hover-tilt/<file>.txt serves each file
 * as is. THIRD_PARTY_NOTICES.md explains the split.
 *
 *   node scripts/check-hover-tilt-source.mjs           # check
 *   node scripts/check-hover-tilt-source.mjs --write   # copy the files over
 *
 * Each fenced file must also start with the MPL-2.0 Exhibit A notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FENCE = 'src/components/export/hover-tilt';
const PUBLISHED = 'public/licenses/source/hover-tilt';
const EXHIBIT_A =
  'This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. ' +
  'If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.';
const write = process.argv.includes('--write');

const list = (dir) =>
  fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).sort() : [];

const sources = list(FENCE);
const errors = [];
if (sources.length === 0) errors.push(`${FENCE} is empty or missing.`);

if (write) fs.mkdirSync(path.join(root, PUBLISHED), { recursive: true });
for (const name of sources) {
  const src = path.join(root, FENCE, name);
  const pub = path.join(root, PUBLISHED, `${name}.txt`);
  const body = fs.readFileSync(src);
  const head = body.toString('utf8', 0, 400).replace(/^\s*(?:\/\*+|\*+|\/\/)|\*\//gm, ' ').replace(/\s+/g, ' ').trim();
  if (!head.startsWith(EXHIBIT_A)) errors.push(`${FENCE}/${name} does not start with the MPL-2.0 Exhibit A notice.`);
  if (fs.existsSync(pub) && fs.readFileSync(pub).equals(body)) continue;
  if (write) {
    fs.writeFileSync(pub, body);
    console.log(`Wrote ${PUBLISHED}/${name}.txt`);
  } else {
    errors.push(`${PUBLISHED}/${name}.txt is ${fs.existsSync(pub) ? 'not equal to' : 'missing for'} ${FENCE}/${name}.`);
  }
}
for (const name of list(PUBLISHED)) {
  if (sources.includes(name.replace(/\.txt$/, ''))) continue;
  if (write) {
    fs.rmSync(path.join(root, PUBLISHED, name));
    console.log(`Removed ${PUBLISHED}/${name}`);
  } else {
    errors.push(`${PUBLISHED}/${name} has no source in ${FENCE}.`);
  }
}

if (errors.length) {
  console.error('The published hover-tilt source does not match the code:');
  for (const error of errors) console.error(`  ${error}`);
  console.error('Run: node scripts/check-hover-tilt-source.mjs --write, then commit the copies.');
  process.exit(1);
}
console.log(`check-hover-tilt-source: ${sources.length} files, published copies match.`);
