---
name: work-report
description: >-
  End-of-turn report template for this repo. After every turn that changes
  anything (code, config, docs, a deploy), close with the five-part report:
  Changed, Merge, Verified, Tradeoffs, You test. "You test" lists only what
  needs the user's own hands or judgment; anything you can run yourself goes
  under Verified with before/after evidence, never handed to the user. Also
  sets the verification standard the report depends on: measure changes, do
  not infer them from code. Always on in this repo.
---

# Work reports

The user asks the same five questions after every piece of work. Answer them
before they ask, in the closing message of every turn that changes something.
A turn that only answers a question needs no report.

The user reads the report on a phone. If it is long, they will not read it
and will ask again, and the turn this template exists to save is wasted.
Keep each section to one or two lines. Drop a section that has nothing to
say. Push detail into the diff, files, and screenshots; link to evidence
instead of restating it.

## The template

- **Changed**: What behaves differently now, in plain language, with commit
  and branch. Name the effect a user or a reader notices, not the files you
  touched. Write "the browser keeps the filter when you go back", not
  "edited PokemonBrowser.tsx". The diff already lists the files. When a
  change alters no behavior, say what it makes possible instead.
- **Merge**: "Merged" for a tier 1 change you already shipped, "Ready for
  production" for a tier 2 change awaiting approval, or "Blocked: <the
  blocker>". CLAUDE.md's Deployment section names the production branch and
  defines the two tiers.
- **Verified**: How you measured that the change works, per the standard
  below — or the honest words "inferred only", plus what stopped you from
  measuring.
- **Tradeoffs**: What this approach costs against the before state or the
  approach not taken. One or two lines. "None worth noting" is a valid
  entry.
- **You test**: Numbered steps for anything that genuinely needs the user's
  hands, device, or judgment — a physical device, an account only they hold,
  a taste call only they can make. Each step names the exact action and the
  expected result, with nothing left to guess. Otherwise "Nothing".
  **Never list a step you could run yourself.** If you can build the commit
  and drive it with Playwright or the `run` skill, that is not a "you test"
  step — it is a "Verified" step, and the before/after evidence belongs up
  there. Asking the user to check what you could have checked is the failure
  this section exists to prevent. When something blocked you from measuring
  (an auth-gated URL, an unreachable host), name it under Verified as the
  gap, not here as a chore for the user.

## Verification standard

"Verified" means measured, never inferred from reading the code:

- A logic change is verified by a test that fails on the old code and
  passes on the new code, aimed at the root cause. Name the test file.
- A visual or behavioral change is verified against the running app:
  Playwright (or the `run` skill) drives it, and screenshots or recordings
  are the evidence. Send them with SendUserFile.
- For UI changes, capture the before state first — from the base commit,
  before applying the change — then the after state. Send one side-by-side
  image so the user reviews without opening a preview deploy.
- When neither path is possible, say "inferred only" in the report. A
  labeled gap is recoverable; a claimed verification that did not happen
  is not.

## Fit with the other rules

This template is the recap the user asked for, so it overrides the
action-first-replies ban on post-task recaps. Every other style rule still applies
inside it. The CLAUDE.md "Never drop" items — approval requests,
corrections, defects found — outrank brevity and go at the top, before the
template.
