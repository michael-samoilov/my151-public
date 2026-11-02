#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'scripts/published-source.json';
const PUBLISHED = 'public/licenses/source';
const write = process.argv.includes('--write');

const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'));
const errors = [];
const listed = new Set();
const sourceDirs = new Set();
let count = 0;

function leadingText(buffer) {
  return buffer
    .toString('utf8', 0, 600)
    .replace(/^\s*(?:\/\*+|\*+|\/\/)|\*\//gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

for (const [project, { notice, files }] of Object.entries(manifest)) {
  for (const [published, source] of Object.entries(files ?? {})) {
    count++;
    listed.add(published);
    sourceDirs.add(path.dirname(source));
    if (path.dirname(published) !== `${PUBLISHED}/${project}` || !published.endsWith('.txt')) {
      errors.push(`${published} must be ${PUBLISHED}/${project}/<file>.txt.`);
      continue;
    }
    const src = path.join(root, source);
    if (!fs.existsSync(src)) {
      errors.push(`${source}, listed for ${published}, does not exist.`);
      continue;
    }
    const body = fs.readFileSync(src);
    if (notice && !leadingText(body).startsWith(notice)) {
      errors.push(`${source} does not start with the ${project} license notice.`);
    }
    const pub = path.join(root, published);
    if (fs.existsSync(pub) && fs.readFileSync(pub).equals(body)) continue;
    if (write) {
      fs.mkdirSync(path.dirname(pub), { recursive: true });
      fs.writeFileSync(pub, body);
      console.log(`Wrote ${published}`);
    } else {
      errors.push(`${published} is ${fs.existsSync(pub) ? 'not equal to' : 'missing for'} ${source}.`);
    }
  }
}

for (const file of walk(path.join(root, PUBLISHED))) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!listed.has(rel)) errors.push(`${rel} is not listed in ${MANIFEST}.`);
}

const sources = new Set(Object.values(manifest).flatMap(({ files }) => Object.values(files ?? {})));
for (const dir of sourceDirs) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!sources.has(rel)) errors.push(`${rel} sits in a published source folder but is not listed in ${MANIFEST}.`);
  }
}

if (errors.length) {
  console.error('The published license source does not match the code:');
  for (const error of errors) console.error(`  ${error}`);
  console.error(`Fix ${MANIFEST}, run node scripts/check-published-source.mjs --write, and commit the copies.`);
  process.exit(1);
}
console.log(`check-published-source: ${count} files in ${Object.keys(manifest).length} project(s), published copies match.`);
