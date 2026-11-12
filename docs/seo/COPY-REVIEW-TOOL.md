# Copy review tool: requirements for the next build

Historical captures and commands are in this folder's Git history.

The copy review artifact lets the owner edit every SEO field beside a live
preview and hand the edits back. The current version is linked from item
P16 of the private SEO plan. These requirements come from using it across four rounds.
Build the next version to meet all of them.

## Layout

1. **Show every preview inline with the field it changes.** The desktop SERP,
   phone SERP, share card, browser tab and on-page render belong beside the
   input that drives them, not in a block above the fields. A reader must see
   what a field affects without scrolling.
2. **Full-screen shows one field across all pages in a row.** When the window
   is wide, lay out a row per field with a column per page, so the title of
   every page reads side by side. That is how copy style gets compared.
3. **No standalone research sections.** Every justification sits beside the
   copy it shaped. The same justification may repeat in several places.

## Round history, per field

Each field shows four things, in this order:

1. Claude's original suggestion.
2. The owner's most recent version, from the last round they edited it.
3. Under that: Claude's comments, warnings and suggestions about that version,
   and the note the owner wrote in the round they made it.
4. A new, empty input for this round's edit.

So a field accumulates a visible history rather than replacing it. The
hand-back export carries the same structure: original, latest, notes.

## Notes

Notes are per field, never per page or per section. A note travels with its
field into the hand-back export.

## Data

Edits and notes persist in the artifact's own store, so Claude can read them
back without a paste. Keep the paste path too: some rounds happen in chat.

## Field list

`slug`, `title`, `description`, `h1`, `intro`, `cards` (hub only), `faq`.
There is no separate `h2s` field: on a tool page the FAQ questions are the
h2 headings, and on the hub the card titles are.
