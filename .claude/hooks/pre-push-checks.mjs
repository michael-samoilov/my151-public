#!/usr/bin/env node
/**
 * PreToolUse hook for Bash. Before a `git push`, it runs lint and the type check
 * (`scripts/ci/pre-push.ts`) and blocks the push when either fails. Agents skip
 * steps that are only written down, so the check lives in a hook.
 *
 * Other commands pass through at once. Any error in the hook or the checker fails
 * open (exit 0), so a bug here never blocks unrelated work.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEREDOC = /<<-?[ \t]*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;
const SEPARATOR = /&&|\|\||[;|&\n()]/;
const OPTION_WITH_VALUE = new Set(['-C', '-c']);

// Quoted text and heredoc bodies hold commit messages, so a message that mentions a push is not a push.
export function isGitPush(command) {
  const text = command.replace(HEREDOC, ' ').replace(QUOTED, ' ');
  for (const segment of text.split(SEPARATOR)) {
    const words = segment.trim().split(/\s+/);
    let next = words.findIndex((word) => word === 'git' || word.endsWith('/git'));
    if (next === -1) continue;
    next += 1;
    while (words[next]?.startsWith('-')) next += OPTION_WITH_VALUE.has(words[next]) ? 2 : 1;
    if (words[next] === 'push') return true;
  }
  return false;
}

function repositoryRoot(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const command = input?.tool_input?.command;
  if (input?.tool_name !== 'Bash' || typeof command !== 'string' || !isGitPush(command)) return 0;
  const root = repositoryRoot(input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  if (!root || !existsSync(join(root, 'scripts', 'ci', 'pre-push.ts'))) return 0;
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ci/pre-push.ts'], { cwd: root, encoding: 'utf8', timeout: 270_000 });
  // The checker exits 2 only when a check fails. Any other failure is the checker's own, so the push goes ahead.
  if (result.status !== 2) return 0;
  process.stderr.write(`${result.stdout}${result.stderr}`.trim()
    + '\n\nPush blocked: fix the errors above, then push again. Run `npm run ci:pre-push` to recheck.\n');
  return 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = 0;
  try {
    code = main();
  } catch {
    // Fail open.
  }
  process.exit(code);
}
