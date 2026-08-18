---
name: work-report
description: >-
  End-of-turn report template for this repo. After every turn that changes
  anything (code, config, docs, a deploy), close with the five-part report:
  Changed, Merge, Verified, Tradeoffs, You test. Also sets the verification
  standard the report depends on: measure changes, do not infer them from
  code. Always on in this repo.
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

- **Changed**: What changed, in one or two lines, with commit and branch.
- **Merge**: "Ready for production" or "Blocked: <the blocker>". Production
  is the branch named in CLAUDE.md's Deployment section, and merging still
  needs the user's per-change approval.
- **Verified**: How you measured that the change works, per the standard
  below — or the honest words "inferred only", plus what stopped you from
  measuring.
- **Tradeoffs**: What this approach costs against the before state or the
  approach not taken. One or two lines. "None worth noting" is a valid
  entry.
- **You test**: Numbered steps for anything that needs the user's hands,
  device, or judgment. Each step names the exact action and the expected
  result, with nothing left to guess. Otherwise "Nothing".

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
