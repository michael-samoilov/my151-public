#!/usr/bin/env node
/**
 * Fails when the source my151 publishes for a license drifts from the files
 * the app builds from.
 *
 * Some licenses, such as MPL-2.0, ask that each file holding the licensed
 * code be available as source to the people who get the app. That code lives
 * in files of its own, with none of my151's code in them, and the site serves
 * a copy of each as public/licenses/source/<project>/<file>.txt.
 * scripts/published-source.json lists the copies, one project per key:
 *
 *   "<project>": {
 *     "license": "MPL-2.0",
 *     "notice": "<text each source file must start with, or omit>",
 *     "files": { "public/licenses/source/<project>/<file>.txt": "<source path>" }
 *   }
 *
 * The check fails when a copy differs from its source or is missing, when a
 * file under public/licenses/source/ is not listed, when a source folder holds
 * a file that is not listed (so it would ship unpublished), or when a source
 * file does not start with its project's notice.
 *
 *   node scripts/check-published-source.mjs           # check
 *   node scripts/check-published-source.mjs --write   # copy the sources over
 */
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

/** The file's first comment, without comment markers or line breaks. */
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

// A source folder holds only published files, so nothing in it ships unpublished.
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
