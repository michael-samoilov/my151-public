// Lint and type check before a push, at the same time. The Claude Code hook in
// .claude/hooks/pre-push-checks.mjs runs this; people and other agents run `npm run ci:pre-push`.
// It reuses the CI runner's lint cache and type-check state, so a repeat check takes seconds.
// Exit 2 means a check failed. Any other non-zero exit is a failure of this script itself.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropTypecheckStateAfterDependencyChange, eslintCacheArgs } from './cache';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SHOWN_LINES = 100;

interface Result { name: string; passed: boolean; output: string; seconds: string }

function check(name: string, command: string, args: string[]): Promise<Result> {
  const started = Date.now();
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: root });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', fail);
    child.once('close', code => done({ name, passed: code === 0, output, seconds: ((Date.now() - started) / 1000).toFixed(1) }));
  });
}

dropTypecheckStateAfterDependencyChange(root);
const results = await Promise.all([
  check('lint', 'npm', ['run', 'lint', '--', ...eslintCacheArgs(root)]),
  check('type check', process.execPath, ['node_modules/typescript/bin/tsc', '-b']),
]);
for (const { name, passed, output, seconds } of results) {
  console.log(`${passed ? 'passed' : 'FAILED'}: ${name} (${seconds}s)`);
  if (!passed) console.log(output.trimEnd().split('\n').slice(-SHOWN_LINES).join('\n'));
}
if (results.some(result => !result.passed)) process.exitCode = 2;
