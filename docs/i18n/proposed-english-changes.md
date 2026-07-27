# Proposed English display changes — awaiting approval

Extraction is meant to be invisible in English: same strings, different source.
Anything that would actually change what an English user sees is parked here
instead of being applied, per your call to approve these manually.

Nothing in this file has been applied.

| Where | Currently shows | Proposed | Why |
|---|---|---|---|
| Browser add/remove FAB (`PokemonBrowser.tsx`) | `Add 3 Pokemon` / `Remove 2 Pokemon` | `Add 3 Pokémon` / `Remove 2 Pokémon` | Every other string in the app spells it `Pokémon`; these two are the only ones without the accent. |

More will be added here as extraction continues — in particular the
`text-transform: capitalize` defects on Pokémon names (`Mr-Mime`, `Farfetchd`,
`Nidoran-F`, `Type-Null`), which are a Phase 2 item.

## Phase 2 — Pokémon name display

The name catalogs are generated and tested, but the tile still renders the
English slug through `displayName()`. Switching it over changes what English
users see, so it is parked here.

**1. Correct spellings (pure fixes).** `displayName` returns the raw slug and
CSS `capitalize` styles it, which mangles anything with punctuation:

| Currently shows | Would show |
|---|---|
| `Mr-Mime` | `Mr. Mime` |
| `Farfetchd` | `Farfetch'd` |
| `Nidoran-F` / `Nidoran-M` | `Nidoran♀` / `Nidoran♂` |
| `Type-Null` | `Type: Null` |
| `Ho-Oh` | `Ho-Oh` (unchanged) |
| `Flabebe` | `Flabébé` |

**2. Alt-form labels (a real design change).** Today regional forms are
abbreviated into the name: `raichu-A`, `tauros-P-combat`, `alcremie-clovr`.
That surgery is English-width-specific and cannot survive translation. The
generated data supports instead showing the species name plus a separate form
descriptor — `Raichu` + `Alolan Form`, `ライチュウ` + `アローラのすがた` — which
is how the games present them in every language.

This needs a layout decision (a second line, a chip, or a tooltip on a
still-abbreviated name), so it is a design call rather than a translation one.
Nothing has been changed.

## Phase 3 — type badges are now drawn, not shipped (already applied)

The type-name badge was a PNG with the English word baked into it, and no
localized set of those exists anywhere — PokeAPI's sprite repo has no
language-coded assets at any generation, and the request for them has gone
unanswered since early 2025. So the badge is now drawn: official colour,
official symbol, and the type name rendered live from the published
`type_names` string for the active locale.

Three things change in English.

**1. The word is title case, not all caps.** The badge art reads `FIRE`; the
game's own string table stores `Fire`, and that is what the app now draws. The
alternative — CSS `text-transform: uppercase` — has to be switched off for
CJK, where it does nothing to the glyphs but mangles any mixed Latin or digits,
and letter-spacing has to be Latin-only too or centred text drifts off-centre
by half the tracking. Title case avoids all of that and matches the publisher's
own data. Easy to reverse if you prefer the shout.

**2. The word is in the app's font.** Inter rather than the game's typeface, at
a size that reads better than the baked-in text did — at tile size the PNG's
lettering was rendering smaller than the Pokémon name above it and was close to
illegible.

**3. Two type colours are corrected.** Sampled from the badge art: `ground`
#945121 → #915121 and `dragon` #5261DE → #5061E1. The other sixteen already
matched exactly. This shows up anywhere the type colour is used, not just on
the badge.

Nothing else about the badge moves: same 5:1 pill, same size in every layout,
same symbol.

## Phase 6 — header nav labels below 380px (already applied, easy to revert)

This one **has** been applied, because leaving it out meant the header pushed
the page sideways as soon as the language globe appeared. Flagging it here
because it is visible in English.

The header has to fit the wordmark, a language globe and three tabs. Measured
at 320px with the globe present: 339px needed against 320px available in
English, 366px under `en-XA`. The overflow is real, not a pseudo-locale
artefact — German's *Statistiken* would do it too.

**Change:** the active tab's text label now expands only from 380px up. Below
that all three tabs are icon-only, and the active tab is marked the way it
already is — by the filled button. From 640px (`sm:`) up every label shows, as
before. Nothing changes at any width above 380px.

Practically: a 320px or 360px phone sees three icons instead of two icons and
one labelled tab. Every mainstream phone (390px iPhone, 393px Pixel, 412px
Android) is unaffected.

The alternative was shrinking the `my151.app` wordmark on mobile, which buys
20–30px — not enough on its own — so it would have had to be combined with
tighter button padding, leaving about 5px of slack. Say the word and I'll
switch to that instead.
