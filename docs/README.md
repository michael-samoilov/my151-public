# Documentation index

This index routes readers to the record that owns each topic.
It does not replace the rules or decisions in those records.

## Understand the app

| Question | Record |
| --- | --- |
| What does my151 do, and how do I run it? | [Project overview](../README.md) |
| How do the tools, saved data, and server interact? | [Architecture](architecture.md) |
| What performance targets and measurement methods apply? | [Performance](performance.md) |
| Where do sprites and their permissions come from? | [Credits and provenance](credits/README.md) |
| How should species, forms, sprites, games, moves, and encounters connect? | [Pokémon data model spec](data-model/pokemon-ontology.md) (proposal) |

## Make a change

| Responsibility | Authoritative record |
| --- | --- |
| Repository coordination and test rules | [AGENTS.md](../AGENTS.md) |
| Build, verification, deployment, and private-source policy | [CLAUDE.md](../CLAUDE.md) |
| Dex standing decisions and work history | Dex handoff, 2026-09-30 (not published) |
| League standing decisions and work history | League handoff, 2026-09-30 (not published) |
| Admin standing decisions and work history | Admin handoff, 2026-09-30 (not published) |
| Favorite Picker standing decisions and work history | Favorite Picker handoff (not published) |
| Reliability work history | Reliability handoff, 2026-09-30 (not published) |
| Pokémon ontology state and next phase | Ontology handoff, 2026-11-02 (not published) |
| Ideas without active implementation | [Backlog](backlog.md) |
| Unscheduled feature requests | Feature backlog in the working notes (not published) |
| Running task list | To-do list in the working notes (not published) |
| Search standing decisions and status | SEO handoff, SEO plan, and SEO reference (not published) |

Handoffs contain dated snapshots and standing product decisions.
Later dated updates supersede older release statements.
An old test count or unchecked task does not establish the state of production.
The production branch and linked release records establish shipped state.
`CLAUDE.md` owns verification and deployment policy when an older handoff differs.

## Find evidence

[Evidence retention](evidence-retention.md) owns retention and archive requirements.
The archive index (`docs/evidence/archive/README.md`) records historical artifacts removed from the working tree and how to retrieve them.
Existing folders under `evidence/`, `favorite-picker-work/`, and `design/` retain their local explanations.
They are historical records unless a current guide or test explicitly uses them.
The handoffs, `notes/`, `evidence/`, and `favorite-picker-work/` are private working records, and the public copy of this repository leaves them out.
`docs/notes` holds working notes: the to-do list, the feature backlog, an interface polish exploration, and the milestone bar layout.
[`readme/`](readme/) holds the screenshots that the [project overview](../README.md) shows.

Verification results apply to their recorded source, inputs, engines, and dates.
Screenshots do not establish API behavior, and a laboratory timing does not establish real-user performance.
