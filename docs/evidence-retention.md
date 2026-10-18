# Keep files that support current work

Retain a file because of its use, never to reach a repository size target.

Keep these files in the checkout:

- App source, assets, dependencies, and configuration.
- Inputs and tools for current builds, tests, verification, editing, and generation. Preserve offline reproducibility.
- Original artwork, licenses, attribution, source inventories, and provenance for shipped assets and data.
- Standing decisions, current guides, concise verification records, and evidence for a genuinely unresolved choice.

Completed screenshots, detailed execution reports, logs, and obsolete prototypes belong in reachable Git history. Being a representative comparison does not make a completed capture a current baseline. A baseline stays only when a current check or decision uses it.

Read later handoff updates before treating an earlier proposal as unresolved. An unused import search alone does not prove that code, a generator, or its inputs are unnecessary.

## Store new run output outside Git

Use `.audit/` or `docs/**/local/` for captures and detailed reports. Both paths are ignored. Keep live CI output in the Git operational directory, as the canonical runner does. Commit a concise result with its source revision, command, outcome, and limits. A failed or incomplete run remains failed or incomplete.

## Remove completed artifacts safely

1. Trace incoming references and executable consumers, including generators and verification tools.
2. Preserve current inputs, decisions, provenance, and nonredundant output guards.
3. Record the source commit, path, mode, blob ID, SHA-256, and byte count in the existing archive manifest format.
4. Restore and compare every selected file before removal. Replace navigational links with commit-pinned links.
5. Verify retained inputs, development workflows, and unchanged app output. Let checkout size follow from these decisions.

The [archive index](evidence/archive/README.md) records recovery commands. Byte recovery does not assemble a runnable historical application. Replay commands in historical reports from a worktree at their recorded revision.

The archive uses reachable Git history and existing access controls. It needs no separate service or public upload. Checkout size decreases. Full-clone historical storage does not.
