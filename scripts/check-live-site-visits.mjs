#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = /https?:\/\/(www\.)?my151\.app\b/i;
const OPENS_LIVE = new RegExp(`(\\.goto\\(|\\bnavigate\\(|WebDriver:Navigate).*${LIVE_URL.source}`, 'i');
const SAFE = /notme|protectLiveSite/;
const CODE = /\.(tsx?|jsx?|mjs|cjs|py|sh)$/;
const SKIP = new Set(['node_modules', 'dist', '.git', 'evidence', 'test-results', 'playwright-report']);

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (CODE.test(entry.name)) yield full;
  }
}

const hits = [];
for (const dir of ['e2e', 'scripts', '.claude', 'docs']) {
  for (const file of walk(path.join(root, dir))) {
    const text = fs.readFileSync(file, 'utf8');
    if (SAFE.test(text)) continue;
    text.split('\n').forEach((line, i) => {
      if (OPENS_LIVE.test(line)) hits.push(`${path.relative(root, file)}:${i + 1}`);
    });
  }
}

if (hits.length) {
  console.error('These lines open the live site in a browser, and the file never keeps out of its analytics:');
  for (const hit of hits) console.error(`  ${hit}`);
  console.error('Call protectLiveSite(context) from scripts/live-site.ts, or open /?notme first. See AGENTS.md, "Visits to the live site".');
  process.exit(1);
}
console.log('check-live-site-visits: no tooling opens the live site unprotected.');
