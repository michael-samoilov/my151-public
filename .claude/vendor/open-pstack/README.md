# Vendored: open-pstack

This directory holds the license and provenance record for the pstack skills
that this repo vendors. The skills themselves live in `.claude/skills/`, and the
subagent definitions live in `.claude/agents/`.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/ericlitman/open-pstack |
| Plugin version | 1.2.0 |
| Vendored commit | `27e0ce32be3dfc496d1372a4f3d45d91d15007da` |
| License | MIT. See `LICENSE`, `LICENSE-cursor-team-kit`, and `LICENSE-superpowers`. |

open-pstack is a community port of [Lauren Tan's pstack](https://github.com/cursor/plugins/tree/main/pstack)
to Claude Code and Codex. `NOTICE.md` records the full upstream attribution
chain. `reference.md` is the upstream technical reference for every skill.

## Why vendored, not installed as a plugin

Upstream ships pstack as a Claude Code plugin. A plugin namespaces its skills,
so the entry point would be `/pstack:poteto-mode`. This repo vendors the skill
tree instead, so the entry point is `/poteto-mode` and the skills load from the
checkout with no per-machine install step.

## Path mapping

`NOTICE.md` uses upstream paths. Translate them like this:

| Upstream path | Path here |
| --- | --- |
| `plugins/pstack/skills/<name>/` | `.claude/skills/<name>/` |
| `plugins/pstack/agents/<name>.md` | `.claude/agents/<name>.md` |

## Local deviations

1. `thermo-nuclear-code-quality-review` keeps this repo's copy. It adds
   `disable-model-invocation: true` to the frontmatter. The body is unchanged.
2. The upstream `hooks/` directory is not vendored. Its `SessionStart` hook
   injects a mandate that routes every non-trivial task into poteto-mode. This
   repo invokes `/poteto-mode` by hand instead. To adopt the mandate, read
   `hooks/session-start-context.md` upstream and add it to the `SessionStart`
   block in `.claude/settings.json`.
3. The upstream `.claude-plugin/` and `.codex-plugin/` manifests are not
   vendored. They only matter to the plugin installer.

## Resync

1. Clone the upstream repo at the tag you want.
2. Copy `plugins/pstack/skills/` over `.claude/skills/`, but skip
   `thermo-nuclear-code-quality-review` unless you re-apply deviation 1.
3. Copy `plugins/pstack/agents/` over `.claude/agents/`.
4. Copy `LICENSE*`, `NOTICE.md`, and `docs/reference.md` into this directory.
5. Update the version and commit rows in the table above.

## Optional model setup

Skills such as `architect`, `arena`, `interrogate`, and `how` can run a
four-model panel. That needs the Codex and Grok command-line tools, plus
[Bun](https://bun.sh) for the dispatch scripts under
`.claude/skills/poteto-mode/scripts/`. Run `/setup-pstack` to configure it. The
skills still work with the single model in the current session, but with less
review diversity.
