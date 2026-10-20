

import fs from 'node:fs';
import path from 'node:path';
import { openBlink } from './lib/engines.ts';
import { runStandardSuite } from './lib/flows.ts';
import { addWorktree, buildIn, startPreview, type Preview } from './lib/servers.ts';
import { Evidence, type Check } from './lib/evidence.ts';

const PORT = 4182;

function replace(dir: string, rel: string, find: string, to: string) {
  const file = path.join(dir, rel);
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(find)) throw new Error(`anchor not found in ${rel}: ${find.slice(0, 40)}`);
  fs.writeFileSync(file, src.replace(find, to));
}

function append(dir: string, rel: string, snippet: string) {
  const file = path.join(dir, rel);
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n${snippet}\n`);
}

interface Mutation { name: string; expectFail: string; expectPassStill?: string; apply: (dir: string) => void; }

const MUTATIONS: Mutation[] = [
  {
    name: 'async-throw',
    expectFail: 'runtime:no-js-errors',
    expectPassStill: 'boot:react-mounted',
    apply: (dir) => append(dir, 'src/main.tsx', `queueMicrotask(() => { throw new Error('verify-injected-async'); });`),
  },
  {
    name: 'wide-element',
    expectFail: 'layout:no-horizontal-overflow',
    apply: (dir) => append(dir, 'src/main.tsx', `queueMicrotask(() => { const d = document.createElement('div'); d.style.cssText = 'position:relative;width:5000px;height:1px'; document.body.appendChild(d); });`),
  },
  {
    name: 'clipped-chip',
    expectFail: 'render:no-clipped-content',
    expectPassStill: 'boot:react-mounted',
    apply: (dir) => append(dir, 'src/main.tsx', `queueMicrotask(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:8px;top:120px;width:60px;height:32px;overflow:hidden;z-index:2147483646;background:#fff'; d.innerHTML = '<span style="display:block;width:120px;height:24px;border:2px solid rgb(51,51,51);box-sizing:border-box">verify-injected-clip</span>'; document.body.appendChild(d); });`),
  },
  {
    name: 'break-persist',

    expectFail: 'placement:real-add-grows-store',
    expectPassStill: 'boot:react-mounted',
    apply: (dir) => replace(dir, 'src/store/usePokedexStore.ts', 'sections: state.sections,', 'sections: {},'),
  },
];

async function suiteAt(url: string, ev: Evidence, label: string): Promise<Check[]> {
  const s = await openBlink(null);
  try { return await runStandardSuite(s, null, { base: url, surface: `discriminate-${label}`, shot: (l) => ev.shotPath(label, l) }); }
  finally { await s.close(); }
}

async function runVariant(ev: Evidence, label: string, mutate: ((dir: string) => void) | null): Promise<Check[]> {
  const wt = addWorktree('HEAD');
  let preview: Preview | null = null;
  try {
    if (mutate) mutate(wt.dir);
    await buildIn(wt.dir);
    preview = await startPreview(wt.dir, PORT);
    return await suiteAt(preview.url, ev, label);
  } finally {
    preview?.stop();
    wt.cleanup();
  }
}

async function main() {
  const ev = new Evidence(`${new Date().toISOString().replace(/[:.]/g, '-')}-discriminate`);
  const rows: { variant: string; verdict: string; detail: string }[] = [];

  const control = await runVariant(ev, 'control', null);
  const controlFails = control.filter((c) => c.status === 'fail').map((c) => c.name);
  const controlOk = controlFails.length === 0;
  rows.push({ variant: 'control (clean)', verdict: controlOk ? 'PASS as expected' : 'BROKEN', detail: controlOk ? 'all checks pass' : `unexpected fails: ${controlFails.join(', ')}` });
  console.log(`control: ${controlOk ? 'PASS (clean tree is green)' : 'BROKEN: ' + controlFails.join(', ')}`);

  for (const m of MUTATIONS) {
    try {
      const checks = await runVariant(ev, m.name, m.apply);
      const target = checks.find((c) => c.name === m.expectFail);
      const caught = target?.status === 'fail';
      const granular = !m.expectPassStill || checks.find((c) => c.name === m.expectPassStill)?.status === 'pass';
      const good = caught && granular;
      rows.push({ variant: m.name, verdict: good ? 'CAUGHT' : 'MISSED', detail: `${m.expectFail}=${target?.status ?? 'absent'}${m.expectPassStill ? `, ${m.expectPassStill}=${checks.find((c) => c.name === m.expectPassStill)?.status}` : ''}` });
      console.log(`${m.name.padEnd(16)} ${good ? 'CAUGHT' : 'MISSED'}  (${m.expectFail} => ${target?.status ?? 'absent'})`);
    } catch (e) {
      rows.push({ variant: m.name, verdict: 'MISSED', detail: `run threw: ${(e as Error).message.slice(0, 80)}` });
      console.log(`${m.name.padEnd(16)} MISSED  (threw: ${(e as Error).message.slice(0, 60)})`);
    }
  }

  const allGood = controlOk && rows.filter((r) => r.variant !== 'control (clean)').every((r) => r.verdict === 'CAUGHT');
  const report = { verdict: allGood ? 'DISCRIMINATES' : 'FAILED', rows };
  fs.writeFileSync(path.join(ev.dir, 'discriminate.json'), JSON.stringify(report, null, 2));
  console.log(`\n${allGood ? 'DISCRIMINATES: clean passes, every injected regression is caught by its check.' : 'FAILED: a mutation slipped through or the clean tree is not green.'}`);
  console.log(`evidence: ${ev.dir}`);
  process.exit(allGood ? 0 : 1);
}

main().then(undefined, (e) => { console.error(e); process.exit(1); });
