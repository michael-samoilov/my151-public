/**
 * Checks that docs/credits/sprite-evidence.json still describes the sprites
 * the app shows. It fails when:
 *
 * - a file a production page can request has no ledger row;
 * - a shown file's bytes changed, so its sha256 no longer equals its row's;
 * - a row names a file that no page shows any more.
 *
 * It runs offline. The list of shown files comes from the app's own catalogs
 * (scripts/credits/shownSprites.ts), which loads them through Vite so
 * `import.meta.glob` and the `@/` alias resolve as they do in the build.
 *
 * Usage: npx tsx scripts/credits/check-sprite-evidence.ts [--list <out.json>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { shownSprites } from './shownSprites';

interface LedgerRow {
  file: string;
  sha256: string;
}

const root = process.cwd();
const LEDGER = 'docs/credits/sprite-evidence.json';

const shown = await shownSprites(root);

const list = process.argv.indexOf('--list');
if (list > 0) {
  writeFileSync(process.argv[list + 1], JSON.stringify(Object.fromEntries([...shown.entries()].sort()), null, 1));
}

const rows = JSON.parse(readFileSync(path.join(root, LEDGER), 'utf8')) as LedgerRow[];
const byFile = new Map(rows.map((row) => [row.file, row]));
const problems: string[] = [];

for (const file of [...shown.keys()].sort()) {
  const served = `public/sprites/${file}`;
  const row = byFile.get(served);
  if (!row) {
    problems.push(`${served}: shown, but has no row in ${LEDGER}.`);
    continue;
  }
  const digest = createHash('sha256').update(readFileSync(path.join(root, served))).digest('hex');
  if (digest !== row.sha256) {
    problems.push(`${served}: sha256 is ${digest}, but its row says ${row.sha256}. Re-prove who drew the new file and update the row.`);
  }
}
for (const row of rows) {
  if (!shown.has(row.file.replace(/^public\/sprites\//, ''))) {
    problems.push(`${row.file}: has a row, but no production page shows it. Remove the row.`);
  }
}

if (problems.length) {
  console.error(`check-sprite-evidence: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-sprite-evidence: ${shown.size} shown sprite files, each with a matching ledger row.`);
