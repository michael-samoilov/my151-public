# Pstack update verification

Verified on October 15, 2026, against upstream commit
`94f5ce95abe8a9dec976967d79941f631cf477cd`, version 0.9.84.
A final `git ls-remote` check confirms that commit is upstream HEAD.

| Check | Result |
| --- | --- |
| Independent comparison with fetched GitHub checkout | All 361 tracked files match in bytes and executable status. |
| `node scripts/check-pstack.mjs` | Pass. Checks the snapshot, skill and agent links, preserved hooks, and local review-skill override. |
| Integrity mutation | Changing the snapshot's `VERSION` produces `Upstream content drift: VERSION`; restoring it passes. |
| Baseline check before update | Fails because the complete snapshot and integrity record are missing. |
| Project routing hook | Default and explicit-on emit bare skill names. Explicit-off emits no routing content. |
| `bun tools/generate.mjs --check` | Pass. All 86 generated files and plugin invariants are current. |
| `bun test tests/` | 1,184 pass, 54 skip, zero failures with Bun 1.3.14 and a child-reaping parent. |
| Script directory `bun run test` | 247 pass, zero failures with Bun 1.3.14. |
| Script directory `bun run typecheck` | Pass. |
| `npm run lint` | Pass. |
| `npm test` | 662 tests across 103 files pass. |
| `npm run build` | Pass, including i18n verification and TypeScript. |
| Repository guards | Viewport tags, test rules, sprite revisions, speed-test detection, and published source pass. |
| Independent integration review | No blockers found. |

## Environment findings

Bun 1.4.3 fails the existing Graphite color-code parser case. The upstream CI
version, Bun 1.3.14, passes all 247 script tests. No upstream source was changed.

The first main-suite run reports 10 process-cleanup failures because this
container does not reap orphaned children. The same suite passes under a Linux
child subreaper. This runs the unmodified suite and reaps its orphaned processes:

```python
import ctypes
import os
import subprocess
import sys

ctypes.CDLL(None).prctl(36, 1, 0, 0, 0)
child = subprocess.Popen(["bun", "test", "tests/"])
while True:
    pid, status = os.waitpid(-1, 0)
    if pid == child.pid:
        sys.exit(os.waitstatus_to_exitcode(status))
```

Run that snippet from `upstream/` with Bun 1.3.14 on `PATH`, after
`bun install --frozen-lockfile`. The script tests also need a frozen install in
`upstream/plugins/pstack/skills/poteto-mode/scripts/`.

The 54 skips include Windows, macOS, and live Pi checks unavailable on this Linux
host. Claude Code's agent indexing is not tested because its CLI is unavailable.
The checker verifies the agent definitions and link targets. Personal model
setup and paid provider probes are outside this source update.

Two upstream files have an extra blank line at EOF, reported by
`git diff --check`. The snapshot preserves those bytes for exact source parity.

This update changes agent tooling only. It does not change application code,
assets, dependencies, or UI, so browser visual verification does not apply.
