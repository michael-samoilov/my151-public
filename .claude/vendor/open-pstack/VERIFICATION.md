# Pstack update verification

Verified on November 22, 2026, against upstream commit
`97d2ba2790822939ee43db0d7856219ea96c450d`, version 0.9.146.

| Check | Result |
| --- | --- |
| `node scripts/check-pstack.mjs` | Pass. 768 upstream files match the lock. All skill and agent links resolve. |
| Project routing hook | Active routing output has no `pstack:` prefix. `session hook: off` emits no routing content. |
| `npm run ci` | Pass. |
| `bun test tests/` in the upstream clone | Not run. The session could not install upstream test dependencies. |
