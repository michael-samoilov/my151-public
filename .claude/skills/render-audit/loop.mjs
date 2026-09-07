#!/usr/bin/env node
/**
 * The fix loop, one round per run: render, audit, and (once the audit is
 * clean) verify. The fix between rounds is yours, at the source; this runner
 * makes each round one command with its own evidence directory and a hard
 * cap on rounds, so a loop that is not converging says so instead of
 * spinning.
 *
 * Usage:
 *   node loop.mjs --out <dir> --render "<shell command>" \
 *     --audit "<audit.mjs arguments>" [--verify "<shell command>"] [--max-rounds 6] [--reset]
 *
 * Exit codes: 0 clean (and verify passed, when given); 1 the audit found
 * errors; 2 the verify command failed; 3 the round cap is spent.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { out: 'render-audit-loop', maxRounds: 6, reset: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--render') opt.render = args[++i];
  else if (a === '--audit') opt.audit = args[++i];
  else if (a === '--verify') opt.verify = args[++i];
  else if (a === '--max-rounds') opt.maxRounds = Number(args[++i]);
  else if (a === '--reset') opt.reset = true;
}
if (!opt.audit) { console.error('loop: --audit "<audit.mjs arguments>" is required'); process.exit(2); }

mkdirSync(opt.out, { recursive: true });
const stateFile = path.join(opt.out, 'loop.json');
const state = !opt.reset && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { round: 0, history: [] };
state.round += 1;
const roundDir = path.join(opt.out, `round-${state.round}`);
mkdirSync(roundDir, { recursive: true });
const here = path.dirname(new URL(import.meta.url).pathname);
const sh = (cmd, label) => {
  console.log(`\n[round ${state.round}] ${label}: ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', env: process.env });
  return r.status ?? 1;
};
const finish = (code, note) => {
  state.history.push({ round: state.round, code, note, dir: roundDir });
  writeFileSync(stateFile, JSON.stringify(state, null, 1));
  console.log(`\n[round ${state.round}] ${note}`);
  process.exit(code);
};

if (state.round > opt.maxRounds) finish(3, `round cap of ${opt.maxRounds} spent; the loop is not converging. Stop, name what still fails and why, and ask.`);
if (opt.render && sh(opt.render, 'render') !== 0) finish(1, 'the render command failed; fix that first');
const auditCode = sh(`node "${path.join(here, 'audit.mjs')}" --out "${roundDir}" ${opt.audit}`, 'audit');
if (auditCode !== 0) finish(1, `the audit found errors (see ${roundDir}); fix each one at its source, then run this command again`);
if (opt.verify && sh(opt.verify, 'verify') !== 0) finish(2, 'the audit is clean but verify failed; fix the regression it names, then run this command again');
finish(0, opt.verify ? 'clean: the audit found nothing and verify passed' : 'clean: the audit found nothing');
