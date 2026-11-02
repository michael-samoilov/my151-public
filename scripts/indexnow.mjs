#!/usr/bin/env node
/**
 * Tells IndexNow-participating search engines that my151.app changed, so they
 * recrawl in hours instead of on their own schedule.
 *
 *   npm run indexnow            # submit every URL in public/sitemap.xml
 *   npm run indexnow -- --dry-run
 *   npm run indexnow -- https://my151.app/     # submit specific URLs instead
 *
 * Bing, Yandex, Seznam and Naver participate. Google does NOT — it ignores
 * IndexNow, so Google still recrawls on its own schedule or via Search Console's
 * "Request indexing". Bing is this app's largest search referrer, which is why
 * this exists.
 *
 * Run it AFTER a production deploy is live and verified. Submitting a URL whose
 * new content has not shipped yet just gets the old page recrawled.
 *
 * The key is deliberately public: the protocol authenticates by serving the key
 * back from the host itself (public/<key>.txt), which proves control of the
 * domain. It is not a secret and belongs in version control.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const HOST = 'my151.app';
// platform: IndexNow proves domain control by fetching this key from the host, so the key is public and committed.
const KEY = 'db3629385ecf9d266eb52f6f38797f3d';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const explicit = args.filter((a) => a.startsWith('http'));

function urlsFromSitemap() {
  const xml = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

const urlList = explicit.length ? explicit : urlsFromSitemap();

if (!urlList.length) {
  console.error('No URLs found. public/sitemap.xml has no <loc> entries.');
  process.exit(1);
}

// platform: IndexNow rejects the whole batch with 422 when any URL is not on HOST.
const foreign = urlList.filter((u) => new URL(u).host !== HOST);
if (foreign.length) {
  console.error(`These URLs are not on ${HOST}, which would fail with 422:`);
  foreign.forEach((u) => console.error(`  ${u}`));
  process.exit(1);
}

const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList };

console.log(`POST ${ENDPOINT}`);
console.log(JSON.stringify(body, null, 2));

if (dryRun) {
  console.log('\n--dry-run: nothing sent.');
  process.exit(0);
}

// platform: A missing or mismatched key file is the usual cause of an IndexNow 403, so the script checks the file first.
let served;
try {
  const res = await fetch(KEY_LOCATION);
  served = (await res.text()).trim();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (err) {
  console.error(`\nCould not read ${KEY_LOCATION}: ${err.message}`);
  console.error('Deploy public/<key>.txt to production before submitting.');
  process.exit(1);
}
if (served !== KEY) {
  console.error(`\n${KEY_LOCATION} served "${served}", expected "${KEY}".`);
  process.exit(1);
}
console.log(`\nKey file verified at ${KEY_LOCATION}`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

const text = await res.text().catch(() => '');

// platform: An egress proxy also answers 4xx, and its 403 means a network policy, not an IndexNow key problem.
if (/not in allowlist|network egress|proxy/i.test(text)) {
  console.error(`\n${res.status} — blocked before reaching IndexNow, by a network policy:`);
  console.error(text.trim());
  console.error('\nThe request never arrived, so nothing was submitted. Allow the host, then retry.');
  process.exit(1);
}

const meaning = {
  200: 'OK — URLs submitted.',
  202: 'Accepted — submitted, key validation still pending.',
  400: 'Bad request — malformed JSON or invalid URL format.',
  403: 'Forbidden — IndexNow could not validate the key file.',
  422: 'Unprocessable — a URL does not belong to the host, or the key does not match.',
  429: 'Too many requests — slow down; this script is meant for occasional use.',
};
console.log(`\n${res.status} ${meaning[res.status] ?? 'Unexpected response.'}`);
if (text.trim()) console.log(text.trim());

process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
