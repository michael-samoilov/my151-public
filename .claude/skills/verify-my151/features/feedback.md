# Feedback form

A report form in the header of every page: a category, a message, and a view of
the context the report sends.

## Sub-features

- Open it with the header button (`[data-feedback-open]`). The hub's "next
  tool" card opens it on the Idea category.
- Four category chips (`form button[aria-pressed]`): bug, translation, idea,
  and other. A chip sends an enum key, never its label.
- A message field (`#feedback-message`) of 4 to 1,000 characters. Send stays
  unavailable below the minimum.
- A "what gets sent" disclosure lists the context: page, locale, viewport, UA,
  placed count, and active filters.
- A honeypot field (`input[name="website"]`), off-screen and hidden from
  assistive tech.

## How to get to it (user POV)

Tap the feedback button in the header of the hub, the dex, or the league. On a
phone the form is a bottom sheet (`[data-overlay] [role="dialog"]`). On desktop
(1024px and wider) it is a card (`role="dialog"`) anchored to the button, with
a close button, `[data-feedback-close]`. Escape or a click outside also closes
it.

## Driving it with the harness

The harness has no feedback suite. The repo's `e2e/feedback.spec.ts` covers the
form with `/api/feedback` stubbed through `page.route`.

Manual drive (a Playwright script, local build only):

1. Route `**/api/feedback` to a stub that records the request body.
2. Click `[data-feedback-open]` and assert the dialog shape for the viewport.
3. Press a category chip and read its `aria-pressed`.
4. Fill `#feedback-message`, wait more than 2 seconds, and submit.
5. Assert that the recorded body carries the category key and the message.

## Gotchas

- Never submit the form on a deployed site. A send writes to the production
  feedback list, and preview deployments share the production database.
- Demo mode does not gate a send. `?notme` only drops the client id, and the
  report still sends.
- The server rejects a send less than 2 seconds after the form opened
  (`MIN_DWELL_MS` in `api/feedback.ts`). It answers a filled honeypot with a
  200 and stores nothing.
- `[data-sheet-keyboard]` is on the phone sheet while a field has focus or the
  on-screen keyboard is open. Since PR #121 a press elsewhere in the sheet
  keeps it until the press is released. Do not wait on it.
- The export survey posts through the same `/api/feedback` endpoint (see
  `league-export.md`).
