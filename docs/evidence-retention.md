# Keep evidence useful and recoverable

Keep the evidence needed to explain, reproduce, and verify the current product. Store routine captures outside the tracked tree.

## Keep in the repository

- Current visual baselines, representative before-and-after examples, and regression inputs.
- Decision records, verification summaries, measurements, and the revision each result describes.
- Source inventories, licenses, attribution, and provenance for shipped assets and data.
- Inputs consumed by build, generation, verification, or browser tests, including `favorite-picker-work/export/seed.json`.
- Unresolved design alternatives until the decision and its selected evidence are recorded.

Do not infer obsolescence from file age or size. Read later handoff updates before treating an earlier proposal as unresolved.

## Store routine captures outside Git

Use `.audit/` for local experiments, intermediate browser reports, and repeated capture rounds. Use `docs/**/local/` when an existing capture tool needs a path beside its report. Both locations are ignored.

Keep live CI output in the Git operational directory, as the canonical runner does. Commit a concise result and the representative artifacts needed to assess it. Do not copy every run into documentation.

Before retaining a report, identify its source revision, command, result, and limits. A failed or incomplete run remains failed or incomplete.

## Archive a completed capture set

1. Check incoming references and executable consumers, including generators and verification harnesses.
2. Keep the decision, measurements, provenance, required inputs, and representative comparisons in the current tree.
3. Record an immutable source commit, path, Git blob ID, SHA-256, byte count, and mode for every archived file.
4. Verify recovery before removing current copies. Replace navigational links with commit-pinned links.
5. Confirm retained files are unchanged, and record the measured checkout reduction.

The [archive index](evidence/archive/README.md) records the completed batches and recovery commands. Historical reports can contain artifact paths relative to their recorded revision. Those paths describe that revision, not necessarily the current checkout.

The archive uses existing reachable Git history and the repository's existing access controls. It requires no separate storage account or public upload. A full clone still includes historical objects. This policy reduces checkout size and future growth, not existing Git history.
