// Read-only health check: which engines can this sandbox actually drive right
// now? Run before any verification, and again after anything looks off. Prints a
// matrix and exits 0 if at least Blink (the guaranteed floor) is up.
import fs from 'node:fs';
import { openSession, blinkDriverChoice, ENGINE_PATHS, type EngineName } from './lib/engines.ts';

const DATA_URL = 'data:text/html,<title>doctor</title><h1 id=x>ok</h1>';

export interface EngineHealth { engine: EngineName; available: boolean; detail: string; }

async function probe(engine: EngineName, pre: () => string | null): Promise<EngineHealth> {
  const missing = pre();
  if (missing) return { engine, available: false, detail: missing };
  try {
    const s = await openSession(engine);
    try {
      await s.navigate(DATA_URL);
      const r = await s.evalJson<{ h1: string; ua: string }>(`return { h1: document.getElementById('x')?.textContent, ua: navigator.userAgent };`);
      const good = r.h1 === 'ok';
      return { engine, available: good, detail: good ? r.ua : `unexpected eval: ${JSON.stringify(r)}` };
    } finally { await s.close(); }
  } catch (e) { return { engine, available: false, detail: (e as Error).message }; }
}

export async function probeEngines(): Promise<EngineHealth[]> {
  const results: EngineHealth[] = [];
  results.push(await probe('blink', () => null));
  results.push(await probe('webkit', () => (fs.existsSync(ENGINE_PATHS.webkitBrowser) ? null : `missing MiniBrowser at ${ENGINE_PATHS.webkitBrowser} (run setup-engines.sh)`)));
  results.push(await probe('gecko', () => (fs.existsSync(ENGINE_PATHS.firefox) ? null : `missing Firefox at ${ENGINE_PATHS.firefox} (run setup-engines.sh)`)));
  return results;
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
