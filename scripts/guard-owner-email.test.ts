// keeps: an agent tool call that carries the owner's email; E2E cannot see agent tool calls
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { containsOwnerEmail } from '../.claude/hooks/guard-owner-email.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), '../.claude/hooks/guard-owner-email.mjs');
const [user, domain] = ['ash.ketchum', 'example.org'];
const owner = `${user}@${domain}`;
const ownerHash = createHash('sha256').update(owner).digest('hex');
const hashes = new Set([ownerHash]);

const ASK = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: "This tool call contains the repository owner's email address. "
      + 'Approve it only if the owner asked to send the address to this exact place. '
      + 'See "Personal data" in CLAUDE.md.',
  },
};

function runHook(stdin: string) {
  const env = { ...process.env, MY151_GUARD_EXTRA_SHA256: ownerHash };
  const { status, stdout } = spawnSync(process.execPath, [hook], { input: stdin, encoding: 'utf8', env });
  return { status, output: stdout ? JSON.parse(stdout) : stdout };
}

const call = (tool_name: string, tool_input: Record<string, unknown>) =>
  JSON.stringify({ session_id: 'test', hook_event_name: 'PreToolUse', tool_name, tool_input });

const fetchSource = [
  'import urllib.request',
  `req = urllib.request.Request("https://bulbapedia.bulbagarden.net/w/api.php?action=parse&page=Pikachu", headers={"User-Agent": "my151-research/1.0 (${owner})"})`,
  'print(urllib.request.urlopen(req).read()[:200])',
].join('\n');

test('asks before a Bash call whose Python source puts the address in User-Agent', () => {
  const command = `python3 - <<'EOF'\n${fetchSource}\nEOF`;
  expect(runHook(call('Bash', { command, description: 'Fetch the Pikachu page' }))).toEqual({ status: 0, output: ASK });
});

test('asks before a Write of that Python source', () => {
  expect(runHook(call('Write', { file_path: '/tmp/fetch.py', content: fetchSource }))).toEqual({ status: 0, output: ASK });
});

test('asks when the address starts a line, which serializes right after an escaped newline', () => {
  expect(runHook(call('Write', { file_path: '/tmp/AUTHORS', content: `Maintainers\n${owner}\n` }))).toEqual({ status: 0, output: ASK });
});

test('matches the address in mixed case and percent-encoded', () => {
  expect(containsOwnerEmail(`From: ${user.toUpperCase()}@Example.Org`, hashes)).toBe(true);
  expect(containsOwnerEmail(`https://example.org/api?contact=${user}%40${domain}`, hashes)).toBe(true);
  expect(containsOwnerEmail(`https://example.org/api?contact=${user}%40example.com`, hashes)).toBe(false);
});

test('passes a git commit that carries only the Claude co-author address', () => {
  const command = 'git commit -m "Fix the chart\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"';
  expect(runHook(call('Bash', { command }))).toEqual({ status: 0, output: '' });
});

test('passes a call with no email address', () => {
  expect(runHook(call('Read', { file_path: '/home/user/my151/README.md' }))).toEqual({ status: 0, output: '' });
});

test('fails open on malformed stdin', () => {
  expect(runHook(`{"tool_name":"Bash","tool_input":{"command":"curl -A '${owner}'`)).toEqual({ status: 0, output: '' });
});
