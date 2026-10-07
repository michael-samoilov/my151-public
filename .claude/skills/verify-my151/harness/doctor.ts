// Read-only health check: which engines can this sandbox actually drive right
// now? Run before any verification, and again after anything looks off. Prints a
// matrix and exits 0 if at least Blink (the guaranteed floor) is up.
import fs from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openSession, blinkDriverChoice, ENGINE_PATHS, type EngineName } from './lib/engines.ts';

export interface EngineHealth { engine: EngineName; available: boolean; detail: string; }

async function probe(engine: EngineName, pre: () => string | null, url: string): Promise<EngineHealth> {
  const missing = pre();
  if (missing) return { engine, available: false, detail: missing };
  try {
    const s = await openSession(engine);
    try {
      await s.navigate(url);
      const r = await s.evalJson<{ h1: string; ua: string }>(`return { h1: document.getElementById('x')?.textContent, ua: navigator.userAgent };`);
      const good = r.h1 === 'ok';
      return { engine, available: good, detail: good ? r.ua : `unexpected eval: ${JSON.stringify(r)}` };
    } finally { await s.close(); }
  } catch (e) { return { engine, available: false, detail: (e as Error).message }; }
}

export async function probeEngines(): Promise<EngineHealth[]> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>doctor</title><h1 id="x">ok</h1>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/`;
    const results: EngineHealth[] = [];
    results.push(await probe('blink', () => null, url));
    results.push(await probe('webkit', () => (fs.existsSync(ENGINE_PATHS.webkitBrowser) ? null : `missing MiniBrowser at ${ENGINE_PATHS.webkitBrowser} (run setup-engines.sh)`), url));
    results.push(await probe('gecko', () => (fs.existsSync(ENGINE_PATHS.firefox) ? null : `missing Firefox at ${ENGINE_PATHS.firefox} (run setup-engines.sh)`), url));
    return results;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  // Say which driver Blink is about to use, so a run's evidence names it and a
  // silent fallback to Playwright is visible here rather than guessed at later.
  try {
    const { driver, detail } = blinkDriverChoice();
    console.log(`driver blink   ${driver} (${detail})`);
  } catch (e) {
    console.log(`driver blink   ERROR ${(e as Error).message}`);
  }
  const health = await probeEngines();
  for (const h of health) console.log(`${h.available ? 'UP  ' : 'DOWN'}  ${h.engine.padEnd(7)}  ${h.detail}`);
  const blink = health.find((h) => h.engine === 'blink');
  if (!blink?.available) { console.error('FATAL: Blink floor is down; nothing can be verified.'); process.exit(1); }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
