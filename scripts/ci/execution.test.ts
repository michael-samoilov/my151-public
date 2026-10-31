import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { RunJournal, settleLanes } from './execution';
import { select } from './policy';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
function journal(signal: AbortSignal) {
  const directory = mkdtempSync(join(tmpdir(), 'ci-execution-'));
  temporary.push(directory);
  return new RunJournal(directory, process.cwd(), select('fast', [], null), 'source', signal);
}

test('a failed child leaves durable failed status and retains its output', async () => {
  const log = journal(new AbortController().signal);
  await expect(log.stage('failure', process.execPath, ['-e', 'console.log("diagnosis"); process.exit(7)'])).rejects.toThrow(/7/);
  expect(() => log.finish('passed')).toThrow(/incomplete/i);
  log.finish('failed');
  const status = JSON.parse(readFileSync(join(log.directory, 'status.json'), 'utf8'));
  expect(status.outcome).toBe('failed');
  expect(status.stages[0].exitCode).toBe(7);
  expect(readFileSync(join(log.directory, 'failure.log'), 'utf8')).toContain('diagnosis');
});

test('interruption stops an owned child and cannot produce a passed record', async () => {
  const controller = new AbortController();
  const log = journal(controller.signal);
  const stage = log.stage('interrupted', process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  controller.abort();
  await expect(stage).rejects.toThrow(/interrupt/i);
  expect(() => log.finish('passed')).toThrow(/incomplete/i);
  log.finish('interrupted');
  const status = JSON.parse(readFileSync(join(log.directory, 'status.json'), 'utf8'));
  expect(status.outcome).toBe('interrupted');
  expect(status.stages[0].outcome).toBe('interrupted');
  expect(status.stages[0].endedAt).toBeTruthy();
});

test('a failed lane fails the run only after every other lane has stopped, so no stage outlives the run record', async () => {
  const log = journal(new AbortController().signal);
  const order: string[] = [];
  const failing = log.stage('lint', process.execPath, ['-e', 'process.exit(3)']).finally(() => order.push('lint ended'));
  const slow = log.stage('unit', process.execPath, ['-e', 'setTimeout(() => {}, 400)']).finally(() => order.push('unit ended'));
  await expect(settleLanes([() => failing, () => slow])).rejects.toThrow(/lint failed/);
  order.push('run ended');
  expect(order).toEqual(['lint ended', 'unit ended', 'run ended']);
  log.finish('failed');
  const status = JSON.parse(readFileSync(join(log.directory, 'status.json'), 'utf8'));
  expect(status.stages.map((stage: { name: string; outcome: string }) => `${stage.name} ${stage.outcome}`)).toEqual(['lint failed', 'unit passed']);
});
