import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { atomicJson, fingerprint, makeReceipt, validateReceipt } from './artifact';
import { RunJournal } from './execution';
import { discoveryCounts, type Discovery } from './discovery';
import { changedPaths, parseOptions, select } from './policy';

async function main() {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const options = parseOptions(process.argv.slice(2));
  const changes = changedPaths(root, options.base ?? process.env.MY151_CI_BASE ?? 'origin/claude/pokedex-region-builder-AviYF');
  const selection = select(options.mode, changes.paths, changes.baseSha, changes.reason);
  if (options.plan) { console.log(JSON.stringify(selection, null, 2)); return; }
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).trim();
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const directory = join(gitDirectory, 'ci-runs', runId);
  mkdirSync(join(gitDirectory, 'ci-runs'), { recursive: true });
  mkdirSync(directory);
  const source = fingerprint(root);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const journal = new RunJournal(directory, root, selection, source, controller.signal, head);
  atomicJson(join(directory, 'selection.json'), selection);
  console.log(`CI ${selection.effectiveMode}: ${selection.reasons.join(' ')}\nLive evidence: ${directory}`);
  const environment = { ...process.env, MY151_CI_RUN_DIR: directory, MY151_CI_RUN_ID: runId };
  try {
    if (selection.effectiveMode !== 'docs') {
      await journal.stage('lint', 'npm', ['run', 'lint']);
      await journal.stage('unit', 'npm', ['test']);
      for (const script of ['check-viewport-tags', 'check-test-rules', 'check-sprite-revisions', 'check-speed-test-detection', 'check-published-source']) {
        await journal.stage(script, process.execPath, [`scripts/${script}.mjs`]);
      }
      await journal.stage('analytics-cells', process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.app.json', 'scripts/build-favorite-analytics-cells.ts', '--check']);
      await journal.stage('build', 'npm', ['run', 'build', '--', '--manifest', '--outDir', join(directory, 'dist'), '--emptyOutDir']);
      makeReceipt(root, directory, runId, source);
      await journal.stage('bundle-budget', process.execPath, ['scripts/check-bundle-budget.mjs', '--dist', join(directory, 'dist')]);
      validateReceipt(root, directory, runId);
      if (process.env.PLAYWRIGHT_BASE_URL) {
        atomicJson(join(directory, 'external-preview.json'), { url: process.env.PLAYWRIGHT_BASE_URL, sourceIdentity: 'unproven', note: 'Browser evidence is external; the local build receipt cannot identify the remote source.' });
      }
      await journal.stage('discovery', process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'scripts/ci/playwright.config.ts', '--list', '--reporter=json'], { ...environment, PLAYWRIGHT_JSON_OUTPUT_FILE: join(directory, 'discovery.json') });
      const discovery = JSON.parse(readFileSync(join(directory, 'discovery.json'), 'utf8')) as Discovery;
      const counts = discoveryCounts(discovery);
      if (!counts.total) throw new Error('Browser selection is empty.');
      atomicJson(join(directory, 'discovery-count.json'), counts);
      await journal.stage('browser', 'flock', ['--no-fork', join(tmpdir(), 'my151-browser.lock'), process.execPath, '--import', 'tsx', 'scripts/ci/browser.ts'], environment);
      validateReceipt(root, directory, runId);
    }
    if (fingerprint(root) !== source) throw new Error('Source inputs changed during verification.');
    journal.finish('passed');
  } catch (error) {
    journal.finish(controller.signal.aborted ? 'interrupted' : 'failed', String(error));
    console.error(String(error));
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    const evidence = join(root, '.audit', 'ci', basename(directory));
    mkdirSync(evidence, { recursive: true });
    cpSync(directory, evidence, { recursive: true, filter: path => path !== join(directory, 'dist') });
    writeFileSync(join(root, '.audit', 'ci', 'latest.json'), `${JSON.stringify({ runId, directory, evidence, outcome: journal.status.outcome })}\n`);
    console.log(`CI ${journal.status.outcome}. Evidence: ${evidence}`);
  }
}

main().catch(error => { console.error(String(error)); process.exitCode = 1; });
