import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIST_FILE = 'deploy-files.json';
export const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const KEEP_BYTES = 50 * 1024 * 1024;

export type DeployFiles = Record<string, string>;
export const LIVE = 'live';

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
