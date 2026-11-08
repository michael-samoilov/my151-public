import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';

type CoverageEntry = Awaited<ReturnType<Page['coverage']['stopJSCoverage']>>[number];
interface SourcePosition { source: string | null }
interface MapConsumer { sources: string[]; originalPositionFor(position: { line: number; column: number }): SourcePosition }

export const TEST_MAP_DIR = process.env.MY151_TEST_MAP_DIR;
const DIST = process.env.MY151_TEST_MAP_DIST;
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const { SourceMapConsumer } = createRequire(import.meta.url)('source-map-js') as { SourceMapConsumer: new (map: unknown) => MapConsumer };

const consumers = new Map<string, MapConsumer | null>();
const lineStarts = new Map<string, number[]>();

function consumerFor(url: URL): MapConsumer | null {
  if (!DIST) return null;
  const file = join(DIST, url.pathname);
  if (!consumers.has(file)) {
    try {
      consumers.set(file, new SourceMapConsumer(JSON.parse(readFileSync(`${file}.map`, 'utf8'))));
    } catch {
      consumers.set(file, null);
    }
  }
  return consumers.get(file) ?? null;
}

function positionOf(source: string, offset: number) {
  let starts = lineStarts.get(source);
  if (!starts) {
    starts = [0];
    for (let index = 0; index < source.length; index++) if (source.charCodeAt(index) === 10) starts.push(index + 1);
    lineStarts.set(source, starts);
  }
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - starts[low] };
}

function repoPath(chunk: URL, source: string): string {
  return relative(ROOT, resolve(dirname(join(DIST!, chunk.pathname)), source));
}

export function sourcesRun(entries: CoverageEntry[]): string[] {
  const found = new Set<string>();
  for (const entry of entries) {
    const url = new URL(entry.url);
    if (url.pathname.startsWith('/src/')) {
      found.add(url.pathname.slice(1));
      continue;
    }
    const consumer = consumerFor(url);
    if (!consumer || !entry.source) continue;
    const withFunctions = new Set<string>();
    for (const fn of entry.functions) {
      const range = fn.ranges[0];
      if (!range || (range.startOffset === 0 && range.endOffset >= entry.source.length)) continue;
      const original = consumer.originalPositionFor(positionOf(entry.source, range.startOffset)).source;
      if (!original) continue;
      const path = repoPath(url, original);
      withFunctions.add(path);
      if (range.count > 0) found.add(path);
    }
    for (const source of consumer.sources) {
      const path = repoPath(url, source);
      if (!withFunctions.has(path)) found.add(path);
    }
  }
  return [...found].filter(path => path.startsWith('src/')).sort();
}

export async function recordSources(browser: Browser, context: BrowserContext, testInfo: TestInfo, run: () => Promise<void>) {
  const pages = new Set<Page>();
  const entries: CoverageEntry[] = [];
  const started: Promise<unknown>[] = [];
  const watch = (page: Page) => {
    pages.add(page);
    started.push(page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {}));
  };
  const watchContext = (target: BrowserContext) => {
    target.pages().forEach(watch);
    target.on('page', watch);
  };
  watchContext(context);
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (...options) => {
    const created = await newContext(...options);
    watchContext(created);
    return created;
  };
  browser.newPage = async (...options) => {
    const page = await newPage(...options);
    watch(page);
    await Promise.all(started);
    return page;
  };
  try {
    await run();
  } finally {
    browser.newContext = newContext;
    browser.newPage = newPage;
    await Promise.all(started);
    for (const page of pages) {
      if (!page.isClosed()) entries.push(...await page.coverage.stopJSCoverage().catch(() => []));
    }
    mkdirSync(TEST_MAP_DIR!, { recursive: true });
    appendFileSync(join(TEST_MAP_DIR!, `worker-${testInfo.parallelIndex}-${process.pid}.jsonl`), `${JSON.stringify({
      file: relative(ROOT, testInfo.file),
      project: testInfo.project.name,
      title: testInfo.titlePath.slice(1).join(' › '),
      sources: sourcesRun(entries),
    })}\n`);
  }
}
