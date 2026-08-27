---
name: verify-my151
description: >-
  Drive the my151.app pokedex builder across real browser engines (Blink, WebKit,
  Gecko) to prove a change works and regresses nothing, without a human verifier.
  Use before declaring UI/behavior work done, to verify a diff on every user
  surface, or when you need cross-engine evidence (iOS Safari, iOS Chrome, Android
  Chrome, desktop Chrome, desktop Firefox).
---

# Verify my151

my151.app is a Vite + React SPA. This skill drives the real app across the three
engines behind its five target surfaces and returns a pass/fail verdict with
evidence. It exists so agent work verifies itself, so read it cold and follow it.

**The model is a per-change before/after differential, not a frozen baseline.**
Assume the current app is correct. On a change, drive the standard surfaces plus
the surfaces the diff touches, at the base ref and at the change, and report the
delta. This never staleness-churns as the app grows, and it matches the repo's
standing rejection of pixel snapshots. Checks are structural (the DOM, computed
style, the localStorage store), never localized text.

## Surfaces to engines

Five surfaces collapse to three engines. Test the engine, not the user-agent
string.

| Surface | Engine | How it runs here |
| --- | --- | --- |
| desktop Chrome, Android Chrome | Blink | Playwright Chromium (pre-installed under `PLAYWRIGHT_BROWSERS_PATH`) |
| iOS Safari, iOS Chrome | WebKit | WebKitGTK MiniBrowser over W3C WebDriver |
| desktop Firefox | Gecko | Mozilla-tarball Firefox over Marionette |

Two jobs, kept separate. **Personas** (Blink + init-script stubs for iOS Safari,
iOS Chrome, Android) assert a platform identity and a mobile viewport, so they can
prove platform-sniff code branches; they are Blink, so they never prove engine
rendering. Today this app has no platform-conditional code (only
`feedbackContext.ts` reads the UA, for telemetry), so the personas currently prove
identity and viewport, not a branch. Their payoff is forward-looking, for the
multi-tool buildout. The **real-engine lanes** (WebKit, Gecko) prove rendering,
layout, and scroll on the actual engine. Every proof asserts its persona/engine
first (`READ_PERSONA` + `assertPersona`), so a run can never silently verify the
wrong surface.

## Launch

One command installs the two engines that need it (Blink ships with Playwright):

```
bash .claude/skills/verify-my151/harness/setup-engines.sh
```

It is idempotent. It `apt`-installs `webkit2gtk-driver` + `xvfb`, downloads
Firefox to `/opt/verify-my151/`, and needs no geckodriver (its only host is
github, which this session gates; Marionette drives Firefox directly). On an
egress block it prints the blocked host and keeps going, so the harness runs on
whatever came up.

The app itself is built and served by the harness. `verify.ts` runs `npm run
build` then `vite preview` on an isolated port (4180 for the change, 4181 for the
base), so nothing collides with the Playwright e2e ports (4173/4174). Deps must be
installed first (`npm ci`).

## Doctor

Before driving anything, and again after anything looks off:

```
node_modules/.bin/tsx .claude/skills/verify-my151/harness/doctor.ts
```

It opens a real session on each engine, navigates a data URL, and reads back the
UA. It exits non-zero only if the Blink floor is down. A `DOWN` engine is reported
honestly and its surfaces are skipped, never faked.

## Drive

From the repo root:

```
# Absolute: invariants must hold on the working-tree build.
node_modules/.bin/tsx .claude/skills/verify-my151/harness/verify.ts absolute

# Diff (the per-change default): build both, drive identical flows, name regressions.
node_modules/.bin/tsx .claude/skills/verify-my151/harness/verify.ts diff --base HEAD

# Narrow the surfaces while iterating:
... verify.ts absolute --surfaces blink,webkit
```

Flags: `--base <ref>` (diff), `--surfaces a,b`, `--no-build` (reuse an existing
`dist/`). The standard suite per surface is boot (React mounts), no horizontal
overflow, the localStorage seed oracle round-trips, the seeded grid renders
sprites, each nav tab activates (read from the nav button's computed background),
the builder container scrolls, and a zero-tolerance JS-error tripwire
(`runtime:no-js-errors`). A blanket overlap audit is deliberately not a standard
check, because the dense sprite grid has intentional micro-overlaps; port
`e2e/support/layoutAudit.ts` for a scoped audit of one container in a future tool. The tripwire is authoritative on Blink, where host-side
`pageerror` and the ErrorBoundary's `[P151] crash` console log are captured, and
best-effort on WebKit and Gecko via a post-load page trap. A real-placement check
(`placement:real-add-grows-store`) drives a live add on desktop Blink and skips
until a `data-testid="verify-evo-card"` lands on the browser card.

**Prove the verifier itself.** `harness/discriminate.ts` is a mutation test: it
injects a known regression (boot throw, async throw, wide element, broken persist)
into a worktree, builds, runs the Blink suite, and asserts the matching check
fails, with the clean tree passing. Run it after changing the harness. A verifier
that always says PASS is worse than none.

```
node_modules/.bin/tsx .claude/skills/verify-my151/harness/discriminate.ts
```

**Find what actually changed first.** Before trusting a run, diff the served tree
against the base (`git status`, `git diff HEAD -- src`) and add checks for the
invariants that change touches, not only the standard suite. A run that drives
only the standard flows can sail past the real edit. Extend `harness/lib/flows.ts`
or add a change-specific flow; keep handles structural.

**Scroll and timing reality in this sandbox.** Headless Chromium synthesizes no
input scroll, so the suite proves scrollability by setting and reading the scroll
offset, not by a gesture. Real iOS touch momentum, rubber-band, safe-area insets,
and memory-pressure kills are device-only; name them, never fake them. WebKitGTK
is software-rendered under Xvfb (~5x a device's paint), so use it for correctness
and relative A/Bs, never absolute timing. The app emits no `performance.mark`;
measure timing externally via the Performance API on the real engine if needed,
and gate on long tasks, not headless frame rate.

## Evidence

Each run writes to `.claude/skills/verify-my151/evidence/<runId>/` (gitignored):
`report.json` (the verdict, per-surface checks, named regressions), one
`<surface>.json` per surface, and per-step screenshots per surface. Screenshots
are proof for a human or agent to inspect, not an auto-diff baseline. Observe the
real user path and its side effects (the localStorage `personal-151-pokedex-v3`
store is the local oracle; beacons are suppressed locally, so do not wait on the
network). State plainly what is device-only.

## Cleanup

`verify.ts` stops both preview servers and removes the base worktree in a
`finally`. Each engine session kills its own process group by pid (the Blink
browser, the Gecko Firefox, and the WebKit driver spawned detached so its group
includes the internally launched MiniBrowser), never a name match. The one
exception is a documented recovery: `openWebKit` clears a stray driver left by a
crashed prior run with a name-based `pkill`, because WebKit is single-session and a
leaked process blocks the port. Evidence is kept. If a run is killed mid-flight,
clear strays with `pkill -9 -f WebKitWebDriver; pkill -9 -f MiniBrowser; pkill -9
-f 'firefox.*marionette'`, then `git worktree prune`. Evidence under `evidence/`
survives every cleanup.

## Helpers

- `harness/setup-engines.sh` installs WebKit + Firefox (shown above).
- `harness/doctor.ts` reports the engine matrix (shown above).
- `harness/verify.ts` is the driver CLI (shown above).
- `harness/discriminate.ts` is the mutation test for the verifier (shown above).
- `harness/lib/engines.ts` is the three-engine Session layer; `personas.ts` the
  Blink identities; `flows.ts` the standard suite; `servers.ts` build+preview and
  worktree isolation; `evidence.ts` the report writer.

## Feature map

`features/` holds one file per user-facing feature, with the four H2s
(`Sub-features`, `How to get to it (user POV)`, `Driving it with the harness`,
`Gotchas`). It describes today's single-tool app. As the multi-tool buildout lands
(league builder, favourite picker), add one feature file per new tool and its
standard-suite coverage. Keep it honest with `/maintain-verification-skill`.
