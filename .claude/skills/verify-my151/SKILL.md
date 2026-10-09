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

my151.app is a multi-page Vite + React app: the hub at `/`, the pokedex builder
at `/pokedex-builder`, and the League Builder at `/custom-gym-leader`. This skill
drives the real app across the three engines behind its five target surfaces
and returns a pass/fail verdict with evidence. It exists so agent work verifies
itself, so read it cold and follow it.

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
| desktop Chrome, Android Chrome | Blink | agent-browser CLI, Playwright as the fallback (Chromium from `PLAYWRIGHT_BROWSERS_PATH`) |
| iOS Safari, iOS Chrome | WebKit | WebKitGTK MiniBrowser over W3C WebDriver |
| desktop Firefox | Gecko | Mozilla-tarball Firefox over Marionette |

Two jobs, kept separate. **Personas** (Blink + init-script stubs for iOS Safari,
iOS Chrome, Android) assert a platform identity and a mobile viewport, so they can
prove platform-sniff code branches; they are Blink, so they never prove engine
rendering. Three places read the UA: `src/lib/feedbackContext.ts` (telemetry),
`src/league/main.tsx` (on iOS it caps the viewport's maximum scale), and
`src/lib/exportImage.ts` (on Android an export downloads instead of opening
the share sheet). The personas can prove those branches. The **real-engine
lanes** (WebKit, Gecko) prove rendering, layout, and scroll on the actual
engine. Every proof asserts its persona/engine first (`READ_PERSONA` +
`assertPersona`), so a run can never silently verify the wrong surface.

## Blink drivers

Blink runs through Vercel's [agent-browser](https://github.com/vercel-labs/agent-browser)
CLI by default. Playwright is the fallback, and `setup-engines.sh` installs the
CLI out-of-tree, so a blocked install costs nothing. Set `VERIFY_BLINK_DRIVER`
to `agent-browser` or `playwright` to force one. `doctor.ts` prints the driver
it will use, so evidence always names it.

agent-browser reaches Blink and nothing else. It drives `chrome` and
`lightpanda` only, and its iOS mode needs Xcode and Appium, so **WebKit and
Gecko keep their own drivers** and stay the only proof of real iOS and Firefox
rendering.

Three CLI behaviors are load-bearing in `lib/agentBrowser.ts`, each one measured:

1. Configure through `AGENT_BROWSER_*` variables, never flags. The CLI keeps a
   daemon and reads flags only when that daemon starts, so a later
   `--user-agent` is dropped and the session runs with a default identity.
2. Give every session a random `--session` name, so a name left by a crashed
   run is never reused.
3. Judge a command by the JSON `success` field. A failed command exits 0.

Two differences from Playwright are handled in code, not left to chance:

- **Clicks do not scroll.** Playwright scrolls a target into view first; the CLI
  does not, so a button below the fold was clicked at the wrong place and did
  nothing. `click()` runs `scrollintoview` first.
- **`record start` drops the persona.** Recording rebuilds the page context and
  loses the user-agent override and the init scripts, keeping only the viewport.
  There is no runtime command to set the UA back, so a persona surface with
  `--video` uses Playwright and says so on stderr.

## Launch

One command installs what needs installing (WebKit, Firefox, agent-browser):

```
bash .claude/skills/verify-my151/harness/setup-engines.sh
```

It is idempotent. It `apt`-installs `webkit2gtk-driver` + `xvfb`, downloads
Firefox and agent-browser to `/opt/verify-my151/`, and needs no geckodriver (its only host is
github, which this session gates; Marionette drives Firefox directly). On an
egress block it prints the blocked host and keeps going, so the harness runs on
whatever came up.

The app itself is built and served by the harness. `verify.ts` runs `npm run
build` then `vite preview` on an isolated port (4180 for the change, 4181 for the
base). The Playwright e2e servers take ports from 10000 through 29999, derived
from the worktree path, so the two never collide. Deps must be installed first
(`npm ci`).

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

The change's production tier in `CLAUDE.md` picks the surfaces: `--surfaces blink` for Small, `--surfaces blink,blink-ios-safari` for Standard, and every surface for Full. A full diff on every surface takes about 25 minutes on a 4-core machine.

Flags: `--base <ref>` (diff), `--surfaces a,b`, `--no-build` (reuse an existing
`dist/`). The standard suite per surface is boot (React mounts), no horizontal
overflow, the localStorage seed oracle round-trips, the seeded grid renders
sprites, each nav tab activates (read from the nav button's computed background),
the builder container scrolls, the render audit finds no clipped, cut, or
truncated content on the grid and on each tab (`render:*-no-clipped-content`,
the in-page code of `.claude/skills/render-audit`), and a zero-tolerance
JS-error tripwire (`runtime:no-js-errors`). The render checks carry every
finding as a key, so diff mode reports a finding the base did not have as a
regression even when the check's status did not flip. A blanket overlap audit
is deliberately not a standard check, because the dense sprite grid has
intentional micro-overlaps; the render audit's overlap rule stays a warning
for the same reason. The tripwire is authoritative on Blink, where host-side
`pageerror` and the ErrorBoundary's `[P151] crash` console log are captured, and
best-effort on WebKit and Gecko via a post-load page trap. A real-placement check
(`placement:real-add-grows-store`) drives a live add on desktop Blink: it opens
the browser from `[data-section-id="meadow"] [data-add-slot]`, clicks a
`[data-testid="verify-evo-card"]`, and asserts the store grew. After the
standard suite, `verify.ts` runs six League Builder suites, listed in
`features/league-builder.md`.

### Visual diff (diff mode)

The checks above only catch what they assert. The visual diff catches the rest:
after the surfaces, diff mode renders a fixed list of screens (`SCREENS` in
`harness/lib/visual.ts`: the hub, the builder's intro, tabs, export and Tools
menu, the league's home, card and menu, and the picker, empty and seeded) at
390 px (2x, touch) and 1280 px, on the base and on the change, with motion
reduced and animations stopped. It renders each build twice, so a region that
differs between two renders of the same build is marked unstable, not changed.
It pins the footer's build stamp, which is the build minute, to one value. It
compares the PNGs on a canvas in Chromium; no snapshot is stored.

It writes `visual.json` (every changed region with its box and the text or
alt text under it) and `visual.png` (each changed screen whole, before and
after, with a box on every region, plus close-ups) to the evidence folder,
and prints one line per region. It does not set the verdict, because an
intended change always changes pixels. It is the gate for "Decided by
Michael" in `CLAUDE.md`: match every changed region to the change's "must
change" list. A region you cannot explain is a regression until proven
otherwise.

```
# Visual diff only, about 5 minutes: skips the engine surfaces.
node_modules/.bin/tsx .claude/skills/verify-my151/harness/verify.ts diff --base origin/claude/pokedex-region-builder-AviYF --visual-only
```

`--no-visual` skips it. When a change reaches a state the list does not
cover, add a screen to `SCREENS` in the same change.

**Prove the verifier itself.** `harness/discriminate.ts` is a mutation test: it
injects a known regression (async throw, wide element, clipped chip, broken persist)
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

## Video

Pass `--video` to record the driven session per surface into the run's evidence.
In diff mode you get a before and an after clip per surface for side-by-side
review.

```
# Record the animation-relevant engines, before and after a change.
node_modules/.bin/tsx .claude/skills/verify-my151/harness/verify.ts diff --base HEAD --surfaces blink,webkit,gecko --video
```

Per engine. Blink records with Playwright's built-in `recordVideo` (a `.webm` at
the context viewport, so personas record at mobile size). WebKit and Gecko have no
built-in recorder, so `--video` runs them under a fixed Xvfb display (WebKit on
`:99`, Firefox non-headless on `:98`) and grabs it with ffmpeg to an `.mp4`. That
needs ffmpeg, which `setup-engines.sh` installs. The default, non-video lanes are
unchanged (`xvfb-run` for WebKit, headless Firefox), so a normal run is unaffected.

When to use. Reach for `--video` when a change touches animation or otherwise
benefits from motion review, such as view transitions, milestone celebrations,
drag-and-reorder, sheet open and close, loading and skeleton states, or layout
reflow. Record on the engines that matter, and attach the before and after clips
as the proof. WebKit and Gecko are where iOS and Firefox animation rendering
actually differs from Blink, so include them for a real cross-engine animation
proof.

Honest caveat, carried from the timing rules. Sandbox video proves animation
correctness and relative before/after behavior, not device smoothness. WebKitGTK
is software-rendered with no vsync, so true 60fps feel stays device-only. Never
present a sandbox clip as a performance proof.

## Evidence

Each run writes to `.claude/skills/verify-my151/evidence/<runId>/` (gitignored):
`report.json` (the verdict, per-surface checks, named regressions), one
`<surface>.json` per surface, and per-step screenshots per surface. Screenshots
are proof for a human or agent to inspect, not an auto-diff baseline. Observe the
real user path and its side effects (the localStorage `personal-151-pokedex-v3`
store is the local oracle). Beacons are not suppressed locally. Only demo mode
or `?notme` holds them back, and `?notme` still lets an export report through.
On `vite preview` they POST and get a 404, so do not wait on the network. State
plainly what is device-only.

## The hand-off test

Every "You test" line in a work report has to pass this test first, and the
answer is almost always that there is no such line.

A "You test" step is only for what no engine here can do: a real finger's
momentum, rubber-band or haptics, a device's safe-area insets, an account or
a device only the user holds, or a taste call only they can make. Everything
else is verifiable here, so it is verified here and reported under
**Verified** with the number, the store value or the screenshot. Name the
missing capability before writing the line; if you cannot name one, drive
it.

The line between the two is not "is it a UI interaction". A tap on a
target, a press at the edge of a control, a state change after a click, a
layout measure, a colour, a scroll offset: these are all drivable. Blink
takes a real touch through Playwright (`page.touchscreen.tap`), Blink and
WebKit take pointer presses (Playwright's mouse, W3C `/actions`), all three
engines take clicks and read computed style and the store through the
Session. Give WebKitGTK a second between a press and the read: at 400ms a
read showed the state before the press, and looked like a failure. The one
place a real finger differs is momentum and rubber-band, named above.

The case that wrote this section: the nav pill's press target was extended
past its paint, and the report asked the user to tap the bar's edge on
their phone and confirm the tab switched. That is a touch at a coordinate
followed by a read of the active tab, which Blink drives in one script and
WebKit in another. It was verified in both within minutes of being asked,
and should have been verified before the report was written.

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
  worktree isolation; `evidence.ts` the report writer; `capture.ts` the Xvfb and
  ffmpeg helpers for the WebKit and Gecko video lanes.

## Feature map

`features/` holds one file per user-facing feature, with the four H2s
(`Sub-features`, `How to get to it (user POV)`, `Driving it with the harness`,
`Gotchas`). It covers the hub (`hub.md`), the pokedex builder and its tabs, the
Pokémon League Builder and its export (`league-export.md`), the feedback form
(`feedback.md`), the language picker (`language.md`), and the admin dashboard
(`admin.md`), and the favorite Pokémon picker (`favorite-picker.md`).
`features/README.md` lists every file with its source owner. Keep the map
honest with `/maintain-verification-skill`.
