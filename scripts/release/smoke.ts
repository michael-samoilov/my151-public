import { chromium } from '@playwright/test';
import { protectLiveSite } from '../live-site';
import { resolveChromium } from '../chromium-path';

export const RELEASE_PAGES = ['/', '/pokedex-builder', '/custom-gym-leader', '/favorite-pokemon-picker'] as const;
export const LIVE_ORIGIN = 'https://my151.app';
const STAMP = /<meta name="p151-build" content="([^"]+)"/;
const REQUIRED_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-content-type-options'];

export async function buildStamp(origin: string): Promise<string> {
  const response = await fetch(`${origin}/?notme`, { signal: AbortSignal.timeout(15_000), headers: { 'cache-control': 'no-cache' } });
  const stamp = STAMP.exec(await response.text())?.[1];
  if (!response.ok || !stamp) throw new Error(`${origin} answered ${response.status} without a p151-build stamp.`);
  return stamp;
}

export async function smoke(origin: string): Promise<string[]> {
  const failures: string[] = [];
  const executablePath = process.env.CHROMIUM_PATH ?? resolveChromium();
  const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chromium' });
  try {
    for (const path of RELEASE_PAGES) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await protectLiveSite(context);
      const page = await context.newPage();
      const problems: string[] = [];
      page.on('pageerror', error => problems.push(`page error: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') problems.push(`console error: ${message.text()}`); });
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin === new URL(origin).origin && response.status() >= 400) problems.push(`${response.status()} ${url.pathname}`);
      });
      const response = await page.goto(`${origin}${path}?notme`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(error => {
        problems.push(`navigation: ${String(error)}`);
        return null;
      });
      if (response && response.status() !== 200) problems.push(`document answered ${response.status()}`);
      if (response) {
        const headers = response.headers();
        for (const header of REQUIRED_HEADERS) if (!headers[header]) problems.push(`missing ${header} header`);
      }
      const text = await page.locator('#root').innerText({ timeout: 10_000 }).catch(() => '');
      if (text.trim().length < 40) problems.push('the page rendered no content into #root');
      failures.push(...problems.map(problem => `${path}: ${problem}`));
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path}${problems.length ? ` (${problems.length} problems)` : ''}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return failures;
}

export async function waitForLive(stamp: string, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let seen = '';
  while (Date.now() < deadline) {
    seen = await buildStamp(LIVE_ORIGIN).catch(() => seen);
    if (seen === stamp) return seen;
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw new Error(`my151.app still serves build ${seen || 'unknown'}, not ${stamp}.`);
}

async function main() {
  const [command, target] = process.argv.slice(2);
  if (command === 'smoke' && target) {
    const origin = new URL(target.startsWith('http') ? target : `https://${target}`).origin;
    const stamp = await buildStamp(origin);
    console.log(`Release smoke for build ${stamp} at ${origin}`);
    const failures = await smoke(origin);
    if (failures.length) {
      console.error(`Do not promote. ${failures.length} problems:\n${failures.map(failure => `  ${failure}`).join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Release smoke passed for build ${stamp}. Promote this deployment, then run: npm run release:live -- ${stamp}`);
  } else if (command === 'live' && target) {
    await waitForLive(target);
    console.log(`my151.app serves build ${target}.`);
  } else {
    console.error('Usage: npm run release:smoke -- <deployment URL>\n       npm run release:live -- <build stamp>');
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
