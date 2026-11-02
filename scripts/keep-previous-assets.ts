/**
 * Keeps the files of the deploys from the last 7 days in each new deploy.
 *
 * A browser tab loads parts of the app only when they are needed: Export,
 * Analytics, an export renderer. Vercel serves only the newest deploy, so
 * once a deploy renamed a file, a tab opened before it got a 404 for that
 * file and crashed or reloaded. With the old files still in place, the tab
 * keeps running the code it started with, and a deploy changes nothing for
 * it. src/lib/staleDeploy.ts still reloads a tab older than the window.
 *
 * Runs after `vite build` on Vercel production builds (vercel.json
 * buildCommand). It reads the live site's /deploy-files.json, which lists
 * every file under /assets the live deploy serves, its own and the ones it
 * kept, downloads the ones this build lacks that left a live deploy less than
 * 7 days ago, and writes the new list. When the list cannot be read, it reads
 * the live pages instead; when they cannot be read either, this deploy keeps
 * nothing.
 *
 * Run locally: KEEP_ASSETS_FROM=http://127.0.0.1:4799 tsx scripts/keep-previous-assets.ts <dist>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIST_FILE = 'deploy-files.json';
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const KEEP_BYTES = 50 * 1024 * 1024;

/**
 * Each file under /assets: `live` for the files of the deploy that wrote the
 * list, or the time (ISO) a deploy dropped it, for a file kept since.
 */
export type DeployFiles = Record<string, string>;
export const LIVE = 'live';

/**
 * The new list and the old files to copy in. A file of the live deploy that
 * this build drops was served until now, so its 7 days start now. A file kept
 * already keeps its time, so it leaves the list 7 days after it was dropped,
 * however many deploys follow. `keep` lists the most recently dropped first.
 */
export function planKept(previous: DeployFiles, built: string[], now: Date, keepMs = KEEP_MS) {
  const next: DeployFiles = {};
  for (const file of built) next[file] = LIVE;
  const keep: string[] = [];
  for (const [file, value] of Object.entries(previous)) {
    if (file in next) continue;
    const dropped = value === LIVE ? now.toISOString() : value;
    if (!(now.getTime() - Date.parse(dropped) <= keepMs)) continue;
    next[file] = dropped;
    keep.push(file);
  }
  keep.sort((a, b) => Date.parse(next[b]) - Date.parse(next[a]));
  return { next, keep };
}

function filesUnder(dir: string, prefix: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}

const ASSET_REF = /(?:assets\/|\.\/)([\w.-]+\.(?:js|css|woff2|svg|png|webp|avif))/g;

async function text(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function crawlLive(site: string, pages: string[]): Promise<string[]> {
  const found = new Set<string>();
  const pending = pages.map((page) => `${site}${page}`);
  for (let url = pending.shift(); url; url = pending.shift()) {
    let body = '';
    try { body = await text(url); } catch { continue; }
    for (const [, name] of body.matchAll(ASSET_REF)) {
      const file = `assets/${name}`;
      if (found.has(file)) continue;
      found.add(file);
      if (/\.(?:js|css)$/.test(name)) pending.push(`${site}/${file}`);
    }
  }
  return [...found];
}

const ASSET_PATH = /^assets\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*$/;

async function readLive(site: string, pages: string[]): Promise<DeployFiles> {
  try {
    const list = JSON.parse(await text(`${site}/${LIST_FILE}`)) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(list).filter((entry): entry is [string, string] =>
      ASSET_PATH.test(entry[0]) && typeof entry[1] === 'string'));
  } catch (error) {
    console.warn(`keep-previous-assets: no file list from ${site} (${String(error)}); reading its pages instead.`);
    return Object.fromEntries((await crawlLive(site, pages)).map((file) => [file, LIVE]));
  }
}

async function main(dist: string, site: string) {
  const now = new Date();
  // platform: Vercel serves index.html at /, and cleanUrls serves name.html at /name.
  const pages = fs.readdirSync(dist).filter((file) => file.endsWith('.html') && file !== '404.html')
    .map((file) => (file === 'index.html' ? '/' : `/${file.slice(0, -'.html'.length)}`));
  const { next, keep } = planKept(await readLive(site, pages), filesUnder(path.join(dist, 'assets'), 'assets/'), now);
  let bytes = 0;
  const queue = [...keep];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      try {
        const response = await fetch(`${site}/${file}`, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = Buffer.from(await response.arrayBuffer());
        if (bytes + body.length > KEEP_BYTES) throw new Error('over the size cap');
        fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true });
        fs.writeFileSync(path.join(dist, file), body);
        bytes += body.length;
      } catch (error) {
        delete next[file];
        console.warn(`keep-previous-assets: could not keep ${file} (${String(error)})`);
      }
    }
  }));
  fs.writeFileSync(path.join(dist, LIST_FILE), JSON.stringify(next));
  const kept = keep.filter((file) => file in next).length;
  console.log(`keep-previous-assets: kept ${kept} files from earlier deploys (${(bytes / 1024).toFixed(0)} KiB).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  const site = process.env.KEEP_ASSETS_FROM
    ?? (process.env.VERCEL_ENV === 'production' ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'my151.app'}` : '');
  if (site) await main(dist, site).catch((error) => console.warn(`keep-previous-assets: failed (${String(error)})`));
  else console.log('keep-previous-assets: not a production build; nothing to keep.');
}
