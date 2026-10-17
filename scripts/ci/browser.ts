import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preview, createServer } from 'vite';
import type { PlaywrightTestConfig } from '@playwright/test';
import root from '../../playwright.config';
import { atomicJson, validateReceipt } from './artifact';

const directory = process.env.MY151_CI_RUN_DIR!;
const status = JSON.parse(readFileSync(join(directory, 'status.json'), 'utf8'));
const stage = status.stages.findLast((stage: { name: string }) => stage.name === 'browser');
atomicJson(join(directory, 'browser-lock.json'), { acquiredAt: new Date().toISOString(), waitMs: Date.now() - Date.parse(stage.startedAt), pid: process.pid });
const receipt = validateReceipt(process.cwd(), directory, process.env.MY151_CI_RUN_ID!);
const discovery: { projects: Record<string, number> } = JSON.parse(readFileSync(join(directory, 'discovery-count.json'), 'utf8'));
const ports = (root as PlaywrightTestConfig).webServer as { port: number }[];
const servers: { close(): Promise<void> }[] = [];
let child: ChildProcess | undefined;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (interrupted) return;
  interrupted = true;
  child?.kill(signal);
});
const terminationListeners = new Set(process.listeners('SIGTERM'));
const inputEndListeners = new Set(process.stdin.listeners('end'));

try {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    const originalNodeEnv = process.env.NODE_ENV;
    servers.push(await preview({ build: { outDir: receipt.dist }, preview: { port: ports[0].port, strictPort: true } }));
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (discovery.projects.dev) {
      const dev = await createServer({ server: { port: ports[1].port, strictPort: true } });
      servers.push(dev);
      await dev.listen();
    }
  }
  // Vite adds process.exit callbacks. This entry point owns shutdown so the
  // browser child stops and the final server record is written before exit.
  for (const listener of process.listeners('SIGTERM')) {
    if (!terminationListeners.has(listener)) process.removeListener('SIGTERM', listener);
  }
  for (const listener of process.stdin.listeners('end')) {
    if (!inputEndListeners.has(listener)) process.stdin.removeListener('end', listener as () => void);
  }
  if (interrupted) throw new Error('Browser startup interrupted.');
  child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'scripts/ci/playwright.config.ts'], { stdio: 'inherit' });
  const code = await new Promise<number | null>((resolve, reject) => {
    child!.once('error', reject);
    child!.once('close', resolve);
  });
  process.exitCode = interrupted ? 130 : code ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = interrupted ? 130 : 1;
} finally {
  await Promise.all(servers.map(server => server.close()));
  atomicJson(join(directory, 'browser-servers-stopped.json'), { pid: process.pid, stoppedAt: new Date().toISOString() });
}
