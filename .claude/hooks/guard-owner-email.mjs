#!/usr/bin/env node
/**
 * PreToolUse hook. It asks for approval before any tool call whose input holds
 * the repository owner's email address. See "Personal data" in CLAUDE.md.
 *
 * The repository stores only SHA-256 hashes of the address, never the address.
 * Any internal error fails open (exit 0, no output), so a bug in this hook never
 * blocks unrelated work.
 */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OWNER_EMAIL_SHA256 = new Set([
  'replace-with-the-sha256-of-the-owner-address',
]);

// More hashes to guard, comma-separated. It can only add hashes, never remove one, so tests can use a fake address.
const EXTRA_SHA256 = (process.env.MY151_GUARD_EXTRA_SHA256 ?? '').split(',').map((hash) => hash.trim()).filter(Boolean);
const GUARDED = new Set([...OWNER_EMAIL_SHA256, ...EXTRA_SHA256]);

// The scan starts at each `@`. A pattern that starts at the local part retries
// every position of a long token and takes seconds on a large Write.
const DOMAIN = /@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+/g;
const LOCAL_PART = /[a-z0-9._%+-]{1,64}$/;

const REASON = "This tool call contains the repository owner's email address. "
  + 'Approve it only if the owner asked to send the address to this exact place. '
  + 'See "Personal data" in CLAUDE.md.';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const percentDecode = (text) => text.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

export function containsOwnerEmail(text, hashes = GUARDED) {
  for (const variant of [text, percentDecode(text)]) {
    const lower = variant.toLowerCase();
    for (const { 0: domain, index } of lower.matchAll(DOMAIN)) {
      const local = LOCAL_PART.exec(lower.slice(Math.max(0, index - 64), index))?.[0] ?? '';
      // The local part can start with the tail of an escape such as `\n`, so test every suffix of it.
      for (let start = 0; start < local.length; start++) {
        if (hashes.has(sha256(local.slice(start) + domain))) return true;
      }
    }
  }
  return false;
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { tool_input } = JSON.parse(readFileSync(0, 'utf8'));
    if (containsOwnerEmail(JSON.stringify(tool_input))) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: REASON,
        },
      }));
    }
  }
} catch {
  // Fail open.
}
