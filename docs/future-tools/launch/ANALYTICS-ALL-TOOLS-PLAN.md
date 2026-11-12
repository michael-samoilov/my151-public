# Plan: report on every tool in the admin dashboard

Written 2026-09-09 for a separate implementation session. The launch
(`2eb8033`) shipped the data the dashboard needs; this plan turns it into
views. Read section 1b of the private analytics accuracy notes first: it
explains the three stores this plan reads.

## What already ships

| View | Where | Source |
| --- | --- | --- |
| Tools card: dex, league, both, league-only, exporters who crossed over | `AdminPage.tsx`, `ToolsCard` | intersection of `clients` and `league:clients` |
| Hub counters: shown, dex clicks, league clicks, builder callout | same card | `funnel` hash |
| Gym leader funnel: opened, seated, typed, named, full, exported, returning, active 7d, recent records | `AdminPage.tsx`, `ToolsCard` | `league:clients` |
| Per-path page views | Vercel Analytics, outside the app | Vercel |

Everything else on the dashboard is dex-only: the daily active chart,
retention, the session and depth survival curves, region, language, device,
OS, the local-time heatmap, and the per-user cards.

## What the data allows

- `clients` (dex) and `league:clients` (league) are the same shape where it
  matters: `firstTs`, `lastTs`, `sessions`, `sessionMs`, `sessionLog`
  (with `ts`, `country`, `dev`, `page`), `country`, `tz`, `locale`,
  `device`, `os`, `browser`. One cid per browser across the site.
- `journal:<YYYY-MM-DD>` holds every funnel event since launch as
  `{t, cid, tool, ev, page}`, 400 days, 50,000 a day at most. This is the
  only record of hub visitors, who have no per-user record.
- `feedback` records carry `route` (`builder`, `view`, `analytics`, `home`,
  `league`, `league-card`).

Every number below is computed on read, so it reaches back to the first
beacon of each store. Nothing needs a backfill.

## Steps

### 1. Lift the aggregations out of the endpoint. 3 hours.

`api/submissions.ts` computes every dashboard number inline against
`ClientRecord`. Move the record-agnostic parts into `api/_aggregate.ts`,
typed against a `SessionRecord` interface that both record types satisfy:
`dailyActive(records)`, `retention(records, now)`, `sessionCurves(records)`,
`tallies(records, field)`, `heatmap(records)`. Unit-test them from
`src/lib/aggregate.test.ts` with two hand-built records. `submissions.ts`
then calls them once per tool.

### 2. A tool switch on the dashboard. 4 hours.

1. `submissions.ts` returns `byTool: { dex: Aggregates; league: Aggregates; all: Aggregates }`
   where `all` merges the two record lists by cid (one person, sessions
   from both tools).
2. The dashboard gets a segmented control at the top: All · Dex builder ·
   Gym leader maker. Every existing card reads from the selected slice.
   The dex-only cards (build drop-off, most picked, off-section picks)
   hide under League.
3. Persist the choice in `localStorage` beside the admin token.

### 3. Hub views from the journal. 4 hours.

1. `api/journal.ts` (admin, rate-limited like the others): `?from=&to=`
   reads the day lists in range with `LRANGE`, capped at 90 days per call,
   and returns the entries. Cache-Control `no-store`.
2. Hub card: distinct browsers per day who saw the hub; per card, distinct
   browsers who clicked, as a share of those who saw it; the same for the
   builder callout.
3. Hub outcomes: of the browsers that saw the hub on a day, how many have
   a dex record, a league record, or both, ever. Journal cids joined to the
   two hashes.

### 4. Cross-tool journeys. 3 hours.

From `firstTs` in both records, for browsers in both: which tool came
first, the median days between, and the share of each week's new dex users
who opened the league within 7 days (and the reverse). One card, two small
tables. This is the number the launch was for.

### 5. League depth and per-user cards. 4 hours.

1. Depth curves for the league, the dex's pattern: share of league users
   reaching 1, 3, 8, 11 cards with a line, and seats 1 to 66, from
   `maxCards` and `maxSeats`.
2. The per-user card gains a league section when the cid has a league
   record: sessions with their `summary` diffs, exports, and the tool
   order from step 4.
3. Feedback by route in `FeedbackCard`: counts per route for 7 and 30
   days, from the records already fetched.

### 6. Data quality. 1 hour.

- `BeaconDropNotice` reads `submit-drop:*` today; add `league-drop:*`.
- A "journal health" line: entries per day for the last 7 days, and the
  day the cap was last hit, if ever.

## Order and estimate

Steps 1 and 2 first (they unblock the rest), then 3, 4, 5, 6. About two
and a half days. Every step is tier 2 (`api/` and `src/components/admin/`),
so the work goes to a preview and the owner approves the merge.

## Not in scope

- Vercel Analytics stays the source for raw page views; the dashboard
  counts people who did something.
- No new client beacons. The hub, dex and league already send what the
  views need.
- No per-user identity beyond the anonymous cid.
