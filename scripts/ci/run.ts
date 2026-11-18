import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { atomicJson, fingerprint, makeReceipt, validateReceipt } from './artifact';
import { eslintCacheArgs } from './cache';
import { RunJournal, settleLanes } from './execution';
import { discoveryCounts, type Discovery } from './discovery';
import { defaultBase } from './base';
import { buildScriptInputs, changedPaths, parseOptions, select } from './policy';
import { buildTestMap, loadTestMap, readAttempts, readRecords, serializeTestMap, TEST_MAP_PATH } from './testMap';

async function main() {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const options = parseOptions(process.argv.slice(2));
  const changes = changedPaths(root, options.base ?? process.env.MY151_CI_BASE ?? defaultBase(root));
  const selection = select(options.mode, changes.paths, changes.baseSha, changes.reason, { map: loadTestMap(root), buildScripts: buildScriptInputs(root) });
  if (options.recordMap && selection.effectiveMode !== 'full') throw new Error('--record-map needs ci:full, so every browser test records its files.');
  if (options.shard && selection.effectiveMode !== 'full') throw new Error('--shard splits the full suite only: use it with ci:full.');
  if (options.shard && options.recordMap) throw new Error('--record-map needs every browser test in one run, so it cannot run on a shard.');
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
  const recording = join(directory, 'test-map');
  const environment = { ...process.env, MY151_CI_RUN_DIR: directory, MY151_CI_RUN_ID: runId, ...(options.shard ? { MY151_CI_SHARD: options.shard } : {}), ...(options.recordMap ? { MY151_TEST_MAP_DIR: recording, MY151_TEST_MAP_DIST: join(directory, 'dist') } : {}) };
  try {
    if (selection.effectiveMode !== 'docs') {
      await settleLanes([
        () => journal.stage('lint', 'npm', ['run', 'lint', '--', ...eslintCacheArgs(root)]),
        () => journal.stage('unit', 'npm', ['test']),
        async () => {
          for (const script of ['check-viewport-tags', 'check-test-rules', 'check-sprite-revisions', 'check-shiny-masks', 'check-speed-test-detection', 'check-live-site-visits', 'check-published-source', 'check-pstack', 'check-skill-triggers']) {
            await journal.stage(script, process.execPath, [`scripts/${script}.mjs`]);
          }
          await journal.stage('sprite-credits', 'npm', ['run', 'credits:check-sprites']);
          await journal.stage('ontology-check', 'npm', ['run', 'ontology:check']);
          await journal.stage('sprite-ink', process.execPath, ['scripts/build-favorite-sprite-ink.mjs', '--check']);
          await journal.stage('verify-harness-types', process.execPath, ['node_modules/typescript/bin/tsc', '-p', '.claude/skills/verify-my151/harness']);
          await journal.stage('analytics-cells', process.execPath, ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.app.json', 'scripts/build-favorite-analytics-cells.ts', '--check']);
        },
        async () => {
          await journal.stage('build', 'npm', ['run', 'build', '--', '--manifest', ...(options.recordMap ? ['--sourcemap', 'hidden'] : []), '--outDir', join(directory, 'dist'), '--emptyOutDir']);
          makeReceipt(root, directory, runId, source);
          await journal.stage('bundle-budget', process.execPath, ['scripts/check-bundle-budget.mjs', '--dist', join(directory, 'dist')]);
          validateReceipt(root, directory, runId);
        },
      ]);
      if (process.env.PLAYWRIGHT_BASE_URL) {
        atomicJson(join(directory, 'external-preview.json'), { url: process.env.PLAYWRIGHT_BASE_URL, sourceIdentity: 'unproven', note: 'Browser evidence is external; the local build receipt cannot identify the remote source.' });
      }
      await journal.stage('discovery', process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'scripts/ci/playwright.config.ts', '--list', '--reporter=json', ...(options.shard ? [`--shard=${options.shard}`] : [])], { ...environment, PLAYWRIGHT_JSON_OUTPUT_FILE: join(directory, 'discovery.json') });
      const discovery = JSON.parse(readFileSync(join(directory, 'discovery.json'), 'utf8')) as Discovery;
      const counts = discoveryCounts(discovery);
      if (!counts.total) throw new Error('Browser selection is empty.');
      atomicJson(join(directory, 'discovery-count.json'), counts);
      try {
        await journal.stage('browser', 'bash', ['scripts/ci/browser-lock.sh', join(tmpdir(), 'my151-browser.lock'), process.execPath, '--import', 'tsx', 'scripts/ci/browser.ts'], environment, { notices: true });
      } finally {
        if (options.recordMap) {
          const map = buildTestMap(readRecords(recording), readAttempts(join(directory, 'browser-attempts.ndjson')), head, new Date().toISOString());
          writeFileSync(join(root, TEST_MAP_PATH), serializeTestMap(map));
          console.log(`Test map: ${Object.keys(map.specs).length} spec files, ${Object.keys(map.sources).length} source files, written to ${TEST_MAP_PATH}.`);
        }
      }
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
