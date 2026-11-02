#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// platform: `ptst` is WebPageTest's user-agent token.
const MARKERS = /lighthouse|pagespeed|page speed|headless|webdriver|\bptst\b|gtmetrix/i;
const TEXT = /\.(tsx?|jsx?|mjs|cjs|html|css|json|txt|xml|webmanifest)$/;
// The one allowed mention. src/lib/automation.ts reads the standard automation
// flag only to tag beacons so the server stores nothing for them. The page
// sends the same requests either way; e2e/automation-flag.spec.ts proves it.
const ALLOWED = new Map([['src/lib/automation.ts', /^webdriver$/i]]);

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (TEXT.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield full;
  }
}

const files = [
  ...['src', 'api', 'public'].flatMap((dir) => [...walk(path.join(root, dir))]),
  ...fs.readdirSync(root).filter((f) => f.endsWith('.html')).map((f) => path.join(root, f)),
  path.join(root, 'vercel.json'),
  path.join(root, 'vite.config.ts'),
];

const hits = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const match = line.match(MARKERS);
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (match && !ALLOWED.get(rel)?.test(match[0])) hits.push(`${rel}:${i + 1}: "${match[0]}"`);
  });
}

if (hits.length) {
  console.error('Shipped code mentions a speed test or an automated browser:');
  for (const hit of hits) console.error(`  ${hit}`);
  console.error('Do not serve a test anything different from what people get. See docs/performance.md, "Guards".');
  process.exit(1);
}
console.log(`check-speed-test-detection: ${files.length} files, no speed-test detection.`);
