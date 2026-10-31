// keeps: a push that the hook does not recognize skips lint and the type check; E2E cannot see agent tool calls
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { isGitPush } from '../.claude/hooks/pre-push-checks.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), '../.claude/hooks/pre-push-checks.mjs');

test.each([
  'git push -u origin claude/work',
  'git -C /home/user/my151 push origin HEAD',
  'cd /home/user/my151 && git push -u origin claude/work',
  'git add -A && git commit -m "Fix" && git push',
  'for i in 1 2 3 4; do git push -u origin claude/work && break; sleep $((2**i)); done',
  'GIT_TRACE=1 git push origin claude/pokedex-region-builder-AviYF',
  'git checkout claude/pokedex-region-builder-AviYF\ngit merge --ff-only claude/work\ngit push origin claude/pokedex-region-builder-AviYF',
  'git --no-pager -c push.default=current push',
])('recognizes a push: %s', command => {
  expect(isGitPush(command)).toBe(true);
});

test.each([
  'git status --short',
  'git commit -m "Run the checks before git push"',
  "git commit -F- <<'EOF'\nAdd a hook that runs before git push.\n\nIt blocks git push when lint fails.\nEOF",
  'git log --grep push --oneline',
  'git config push.default current',
  'npm run lint',
  'echo "remember to git push"',
])('ignores a command that does not push: %s', command => {
  expect(isGitPush(command)).toBe(false);
});

test('a command that does not push passes through without running any check', () => {
  const started = Date.now();
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: process.cwd() }),
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).toBe('');
  expect(Date.now() - started).toBeLessThan(2000);
});

test('malformed hook input fails open, so a hook bug never blocks work', () => {
  const result = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  expect(result.status).toBe(0);
});
