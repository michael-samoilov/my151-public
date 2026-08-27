---
name: google-style
description: >-
  Distilled Google developer documentation style guide for this repo. Apply it
  to every piece of prose you produce: responses, visible thinking,
  documentation, commit messages, PR descriptions, review comments, and code
  comments. Use it whenever you write or edit text, even when the task is not
  about documentation.
---

# Google developer documentation style

Follow these rules in everything you write for this repo. The source is the
[Google developer documentation style guide](https://developers.google.com/style).
Cloud containers cannot reach that domain, so this file must stand on its own.
For word-level questions, read [word-list.md](word-list.md) in this directory.

## Scope and precedence

- Apply the rules to all prose: responses, visible thinking, docs, commit
  messages, PR text, review comments, and code comments.
- Do not apply them to app UI strings or i18n content. Game terminology and the
  `docs/i18n` fixtures are authoritative there, and `npm run i18n:verify`
  enforces them.
- Do not rename existing code identifiers to match this guide.
- The "Response style" section of `CLAUDE.md`, including the vendored
  `action-first-replies` skill it adopts, wins when the two conflict. The guides mostly
  agree.

## Voice and tone

- Write like a knowledgeable friend: conversational, direct, and respectful.
  No slang, no frivolity, no marketing language.
- Address the reader as "you". Use "we" only in "we recommend".
- Use active voice. Name who does what.
- Use present tense. Write "the command creates", not "the command will
  create". Software behavior is not a future event.
- Do not write "please" in instructions. Do not use exclamation points.
- Delete "simply", "just", "easy", "easily", "quickly", "obviously", and
  "of course". They assume the reader's experience and add no information.
- Do not use idiom, metaphor, or humor that needs cultural context. The
  audience is global, so literal language works best.
- Contractions are fine ("it's", "don't", "you're"). Avoid awkward or double
  contractions ("there'd", "mustn't've").
- Do not give software human intent. Write "the parser rejects", not "the
  parser wants" or "the app thinks".

## Inclusive and accessible language

- Use singular "they" for any person of unstated gender. Never infer pronouns
  from a name.
- Use "allowlist" and "blocklist", "primary" and "replica", "placeholder" and
  "sample". Do not use "whitelist", "blacklist", "master", "slave", "dummy",
  or "sanity check" (use "validation" or "quick check").
- Write "unavailable" or "inactive", not "grayed out" or "disabled" for UI
  states.
- Prefer "stop" or "end" over "kill"; the `kill` command itself stays in code
  font.

## Word choice

Each word carries one job. The high-frequency rules:

- "can" = ability. "might" = possibility. "must" = requirement. Do not use
  "may"; it is ambiguous between the first two.
- Write "for example", not "e.g.". Write "that is", not "i.e.". Write "such as
  x and y", not "etc.".
- Write "to", not "in order to". Write "use", not "utilize" or "leverage".
- Write "because", not causal "since". Write "although", not contrastive
  "while". Write "after", not temporal "once". Keep "since" and "while" for
  time, "once" for count.
- Write "by using" or "through", not "via".
- One-word forms, no hyphen: "email", "filename", "username", "website",
  "frontend", "backend". Lowercase "internet" and "web".
- "sign in" is the verb; "sign-in" is the modifier. Match the product's own
  label when one exists.
- "click" for a pointer, "tap" for touch, "enter" for field values. "Select"
  and "clear" for checkboxes. Never "click on" or "hit".
- Refer to document positions as "earlier", "later", or by section name, not
  "above" or "below".
- For anything not listed here, read [word-list.md](word-list.md).

## Mechanics

- Use American spelling. Use the serial comma.
- Use sentence case for every heading, title, and table header. Capitalize
  only the first word and proper nouns. No period at the end of a heading.
- Spell out zero through nine. Use numerals for 10 and up, and always for
  versions, percentages ("50%"), and units ("64 GB", with a space). Do not
  start a sentence with a numeral; rephrase instead.
- Format dates as "August 18, 2026". Use YYYY-MM-DD for numeric dates. Format
  times as "3:45 PM".
- Format ranges with a hyphen and no spaces: "5-10 minutes". Set an em dash
  with no surrounding spaces—like this.
- Spell out an abbreviation on first use with the short form in parentheses:
  "continuous integration (CI)". Skip this for well-known terms (API, URL,
  HTML). Choose "a" or "an" by pronunciation: "an API", "a URL", "an SDK".
- Hyphenate a compound modifier before a noun ("pixel-perfect sprite"), not
  after it, and never after an "-ly" adverb.
- Avoid semicolons; split into two sentences. Keep parentheses for true
  asides; important content gets its own sentence.

## Structure

- Put the most important information first—in the document, the paragraph,
  and the sentence.
- Start a task heading with a bare verb: "Create a preview branch". Write a
  concept heading as a noun phrase: "Sprite caching".
- Use a numbered list only for a sequence. Use a bulleted list for everything
  else. Introduce each list with a sentence that ends in a colon. Keep items
  parallel in form.
- Write procedures with one action per step. State the location, then the
  action: "In the **Name** field, enter a name." Start optional steps with
  "Optional:".
- Bold UI element names as the UI displays them: "Click **Save**". Join menu
  paths with a greater-than sign: "**File > New**".
- Make link text describe the target: "see [Deployment](#)". Never "click
  here" or "this page".
- Write timelessly. Do not use "currently", "new", "soon", or "as of this
  writing", and do not describe product behavior in the future tense.

## Code in prose

- Use code font for filenames, paths, commands, flags, environment variables,
  classes, methods, literal values, and HTTP status codes. Do not use code
  font for product names.
- Write placeholders in uppercase snake case inside code font: `PROJECT_ID`.
  State what to replace each placeholder with.
- Show a command and its output separately, and one command per line.
