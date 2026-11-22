# Vendored pstack

This repository vendors the complete [pstack-claude](https://github.com/michael-denyer/pstack-claude)
distribution. The historical `open-pstack` directory name stays stable for links.
The upstream author is a third party, unrelated to this repository's owner.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/michael-denyer/pstack-claude |
| Version | 0.9.146 |
| Commit | `97d2ba2790822939ee43db0d7856219ea96c450d` |
| Snapshot | `upstream/`, all 768 tracked upstream files |
| Integrity record | `upstream-lock.json`, SHA-256 and executable status for every file |
| License | MIT. See `LICENSE`, `LICENSE-cursor-team-kit`, and `LICENSE-thermos`. |

`NOTICE.md` records attribution. `NOTICE-skills.md` covers skills-only installs.
`reference.md` links to the upstream technical reference. These files link into
the snapshot, so there is one source of upstream content.

## Runtime integration

The entire upstream distribution remains unchanged under `upstream/`, including
skills, agents, hooks, manifests, model defaults, Codex prompts,
Pi extension, runtime assets, documentation, generators, and tests. Its package
metadata stays separate from the application package.

`.claude/skills/<name>` links to `upstream/plugins/pstack/skills/<name>`.
`.claude/agents/<name>.md` links to upstream agents.
`.agents/skills` links to `.claude/skills` for repository-scoped Codex discovery.
Project-specific skills stay in place.

Claude Code's project settings preserve the existing style and environment
hooks and add `.claude/hooks/pstack-session-start.sh`. This adapter runs the
upstream routing hook and removes `pstack:` from its output. The upstream hook
honors `session hook: off` in the user's model sheet. Other upstream references
also use plugin names. `CLAUDE.md` maps those to the local bare skill and agent
names. Native plugin installation is optional and is not performed by this
update. Codex uses repository skills and the standing routing instruction in
`CLAUDE.md`, which `AGENTS.md` requires it to read. Native Codex plugin hooks
require trust through `/hooks` when installed.

## Local deviations

1. `thermo-nuclear-code-quality-review` stays a local copy with
   `disable-model-invocation: true` added to its frontmatter. Its remaining
   content matches upstream. The unchanged source also remains in the snapshot.
2. Project skill and agent discovery uses relative links instead of a
   machine-wide plugin install. Invoke `/poteto-mode`, not `/pstack:poteto-mode`.
3. The project hook adapts plugin names, without modifying upstream hooks.
4. Personal model sheets and provider credentials remain outside this update.
   Run `/setup-pstack` when runtime-specific model configuration is needed.

Release 0.9.146 retired the generated effort agents (`effort-<level>` and
`poteto-agent-<level>`). The Claude Code `Agent` call now takes an `effort`
field, and `poteto-mode` passes the role's level through it. This version belongs
to a different release history from the previous `ericlitman/open-pstack` 1.2.0
snapshot. Its smaller version number is not a rollback within that project's
history.

## What is enforced, and how

| Rule | Enforcement |
| --- | --- |
| Route non-trivial work through `/poteto-mode` | The SessionStart hook `.claude/hooks/pstack-session-start.sh` injects the upstream routing instruction into every Claude Code session. Codex reads the same instruction through `CLAUDE.md`. |
| No code comments | ESLint rule `my151/no-comments` in `scripts/eslint/plugin.mjs`. Lint fails on any comment except tool directives and `// platform: <reason>`. The pre-push hook and `npm run ci` both run lint. |
| Written rules become checks | `WRITTEN_RULES` in `scripts/eslint/writtenRules.mjs`, with a required bad and good sample per rule in `writtenRules.test.ts`. |
| The vendored snapshot stays unmodified | `node scripts/check-pstack.mjs` compares every file with `upstream-lock.json` and checks every skill and agent link. `npm run ci` runs it. |

## Use in another repository

The setup is three parts, and each part copies as it is:

1. `.claude/vendor/open-pstack/` with `scripts/sync-pstack.mjs` and `scripts/check-pstack.mjs`.
2. `.claude/hooks/pstack-session-start.sh` and its SessionStart entry in `.claude/settings.json`.
3. The "pstack" section of `CLAUDE.md`, and a lint rule that bans comments.

In the new repository, run `node scripts/sync-pstack.mjs <clone>` once to create
the skill and agent links. Remove the project-specific assertions at the end of
`check-pstack.mjs`.

## Resync

1. Clone `https://github.com/michael-denyer/pstack-claude` into a separate
   directory, outside this repository.
2. Run `node scripts/sync-pstack.mjs <clone>`. It replaces `upstream/` with the
   clone's tracked files, keeps executable bits, writes `upstream-lock.json`,
   relinks skills and agents, removes links to retired entries, and keeps the
   review skill's frontmatter deviation. Project-specific skills stay in place.
3. Update this record, `.claude/rules/pstack.md`, and `CLAUDE.md`. Run
   `node scripts/check-pstack.mjs` and the hook smoke checks. Verify that
   `session hook: off` in `~/.claude/pstack-models.md` suppresses routing, and
   that active routing output contains no `pstack:` prefix.
4. Run the upstream tests in the clone with the Bun version that upstream CI pins
   (1.4.4 for 0.9.146): `bun test tests/`.
5. Run the repository's required work-branch checks before merging.
