#!/usr/bin/env node
/**
 * Fails when shipped code looks for a speed test. A page that detects
 * Lighthouse, PageSpeed Insights, or a headless browser can serve the test a
 * lighter page than people get, so its score stops meaning anything.
 * docs/performance.md, "Guards", explains the rule.
 *
 *   node scripts/check-speed-test-detection.mjs
 *
 * It reads the code a browser or the server runs: src/ (not unit tests), api/,
 * public/ text files, the HTML entries, vercel.json, and vite.config.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// User-agent and API markers of speed tests and automated browsers.
// `ptst` is WebPageTest's user-agent token.
const MARKERS = /lighthouse|pagespeed|page speed|headless|webdriver|\bptst\b|gtmetrix/i;
const TEXT = /\.(tsx?|jsx?|mjs|cjs|html|css|json|txt|xml|webmanifest)$/;

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
    if (match) hits.push(`${path.relative(root, file)}:${i + 1}: "${match[0]}"`);
  });
}

if (hits.length) {
  console.error('Shipped code mentions a speed test or an automated browser:');
  for (const hit of hits) console.error(`  ${hit}`);
  console.error('Do not serve a test anything different from what people get. See docs/performance.md, "Guards".');
  process.exit(1);
}
console.log(`check-speed-test-detection: ${files.length} files, no speed-test detection.`);
