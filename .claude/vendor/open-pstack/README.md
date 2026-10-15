# Vendored pstack

This repository vendors the complete [pstack-claude](https://github.com/michael-denyer/pstack-claude)
distribution. The historical `open-pstack` directory name stays stable for links.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/michael-denyer/pstack-claude |
| Version | 0.9.84 |
| Commit | `94f5ce95abe8a9dec976967d79941f631cf477cd` |
| Snapshot | `upstream/`, all 361 tracked upstream files |
| Integrity record | `upstream-lock.json`, SHA-256 and executable status for every file |
| License | MIT. See `LICENSE`, `LICENSE-cursor-team-kit`, and `LICENSE-thermos`. |

`NOTICE.md` records attribution. `NOTICE-skills.md` covers skills-only installs.
`reference.md` links to the upstream technical reference. These files link into
the snapshot, so there is one source of upstream content.

## Runtime integration

The entire upstream distribution remains unchanged under `upstream/`, including
skills, agents, effort agents, hooks, manifests, model defaults, Codex prompts,
Pi extension, runtime assets, documentation, generators, and tests. Its package
metadata stays separate from the application package.

`.claude/skills/<name>` links to `upstream/plugins/pstack/skills/<name>`.
`.claude/agents/<name>.md` links to upstream agents and effort agents.
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

The obsolete `pstack-fable-*` and `pstack-opus-*` agents were removed. The current
release supplies generic effort agents and native model defaults instead.
This version belongs to a different release history from the previous
`ericlitman/open-pstack` 1.2.0 snapshot. Its smaller version number is not a
rollback within that project's history.

## Resync

1. Fetch the requested upstream repository into a separate clone. Record its
   resolved commit and `VERSION` before copying anything.
2. Replace `upstream/` with all files from `git ls-files` at that commit.
   Preserve executable permissions. Exclude the clone's `.git` and untracked files.
3. Regenerate `upstream-lock.json` with repository, commit, version, and each
   file's SHA-256 plus executable status. Refresh discovery links from the
   upstream skill, agent, and effort-agent directories. Remove links for
   retired upstream entries. Preserve project-specific skills and the review
   skill's frontmatter deviation.
4. Update this record and `CLAUDE.md`. Run `node scripts/check-pstack.mjs`,
   the upstream tests, and the hook smoke checks. Verify `session hook: off`
   suppresses routing, and that active routing uses bare skill names.
5. Run the repository's required work-branch checks before merging.

Run upstream checks from `upstream/` with Bun 1.3.14, matching upstream CI:
`bun test tests/`. Bun 1.4.3 fails the Graphite color-code parser test; the
pinned version passes it. The script
suite under `plugins/pstack/skills/poteto-mode/scripts` has its own dependencies
and test command. Install those dependencies with its frozen Bun lockfile.
