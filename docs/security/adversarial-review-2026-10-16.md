# Adversarial review, October 16, 2026

Historical captures and commands are in this folder's Git history.

## Scope and execution plan

Base: `40aceaf9`, from `origin/claude/pokedex-region-builder-AviYF`.

The application uses React/Vite, Vercel functions, Upstash Redis, anonymous
browser identifiers, and one server-side admin token. Saved builds live in the
browser. Anonymous telemetry identifiers are not authenticated user accounts.

There is no visitor login, account table, role hierarchy, password reset, paid
credit balance, or tenant data model. The public tools are intentionally open.
Zustand persistence saves Dex, League, and Picker selections in localStorage.
Public Vercel functions collect anonymous usage, feedback, and crash reports in
Redis. Private analytics readers and the archive action require the owner's
Bearer token through `requireAdmin()`. That token check is the app's privileged
access boundary; it is separate from any visitor account system.

Vercel preview protection is a hosting-platform setting. It does not give my151
a login. On 2026-11-12, preview protection is off for this project, so a
preview URL opens without a sign-in. Previews are read-only by code: on any
host other than `my151.app` or `www.my151.app`, `isReadOnlyDeployment()` in
`api/_shared.ts` makes each write endpoint store nothing. This review does not
classify public preview access as a defect. It adds no visitor authentication
feature.

During the review, Vercel previews shared production Redis. All attack probes
therefore run locally against synthetic fixtures.
No test uses production Redis credentials, real visitor records, deployed write
requests, payments, or cloud configuration changes.

1. Inventory public and privileged endpoints, persistence, and external calls.
2. Run independent access, API-limit, and browser reviews in isolated worktrees.
3. Record exact synthetic requests, responses, and proof limits.
4. Fix demonstrated defects and repeat the same probes.
5. Retain regression scripts and run the repository's required checks.

## Adapt the online checklist

| Attack | Application-specific adaptation |
| --- | --- |
| Public database-key access | Check frontend database credentials and unauthenticated admin readers. Redis credentials must remain server-side. |
| Swap A/B identifiers | Probe synthetic anonymous telemetry identifiers. Distinguish telemetry poisoning from access to saved builds. |
| Set own admin role | Probe body, query, and header authorization bypasses. There is no profile or role-update feature. |
| Reuse password reset | Not applicable: no user sign-in or reset flow. |
| Bypass hidden UI | Call privileged readers and archive mutation directly with synthetic requests. |
| Exhaust free uses | Adapt to server-enforced telemetry and feedback limits. There are no paid/free account credits. |
| Race remaining credits | Adapt to concurrent allowance enforcement with isolated Redis transport. |
| Invalid form values | Exercise public handlers with empty, oversized, negative, and hostile inputs. |
| Redirect through `next` | Check routing and browser behavior. There is no post-login redirect flow. |
| Stored script injection | Render malicious synthetic feedback in the local admin browser. |
| Server-side URL fetching | Inventory callable fetches. Skip internal-address requests if no user-controlled URL fetch exists. |
| Cross-user cache leakage | Check privileged response headers, browser context isolation, and service-worker cache scope. |
| Public preview links | Hosting protection requires deployment evidence. Do not infer authentication from `noindex` or read-only writes. |
| AI prompt injection | Not applicable unless an app-facing AI tool or document ingestion feature is found. Build-time development tools are separate. |

## Findings and fixes

Fix commit: `e4ea66c9` on `security/adversarial-review-20261016`.

No admin authorization bypass or saved-build disclosure was demonstrated.
Two analytics abuse-control defects were demonstrated and fixed. Feedback cache
headers were hardened separately. The worker reports preserve baseline findings;
this report describes the integrated result.

| Finding | Before, same synthetic input | After | Evidence |
| --- | --- | --- | --- |
| Dex budget selected by client `tool` | Exhaust Dex CID allowance; `tool=dex` returns 429, but `hub`, `league`, and `favorites` each return 200 and write Dex analytics. | All four use the endpoint's Dex budget and return 429. | `scripts/security-limits.test.ts`; baseline failure and sanitized transcript in the private evidence folder for this review. |
| Dex and League record-cap race | At 49,999 records, 20 concurrent new identities reach 50,019 in each store. | The actual CAS Lua admits one and refuses 19, ending at 50,000. | `scripts/security-redis-caps.mjs`; real Redis before/after JSON. |
| Feedback cache restriction absent | Authenticated response returns 200 without `Cache-Control`. | The handler sets `Cache-Control: no-store` before authentication, including errors and refusals. | `scripts/security-access.test.ts`; baseline fails, all 55 access tests pass after the fix. Shared-cache disclosure was not demonstrated. |

The capacity check now runs inside the existing atomic write. Existing records
still update at capacity, including records without a version field. An orphan
version cannot bypass the new-record cap. Each successful Dex/League CAS adds
one Redis `HEXISTS` operation. Removing the separate `HLEN` request removes a
network round trip, but Lua subcommands still count toward provider usage.

## Checklist results

| Attack | Executed result | Coverage and final status |
| --- | --- | --- |
| Public database access | Unauthenticated requests to all five private readers return 401 with no application-store reads. | Real handlers, mocked store. No frontend database key is found by code inspection. Direct production table access is not attempted. |
| Swap A/B IDs | A second synthetic caller can replace telemetry under a known CID. The same CID cannot read admin records without the bearer. | Residual anonymous analytics integrity risk. No saved-build access: selections remain browser-local. |
| Self-promote to admin | Role body/query/header/cookie variants cannot authorize readers or archive writes. | Refused in real handlers with local fixtures. There is no profile-update feature. |
| Reset-link replay | No reset or account-sign-in feature exists. | Not applicable; no runtime replay claimed. |
| Skip UI restrictions | Direct archive requests without owner bearer return 401. Direct feedback still enforces validation, dwell, and server allowances. | Refused where privileged. Valid public feedback remains public. |
| Call after allowance exhaustion | Exhausted feedback allowance returns 429. The reproduced Dex tool-budget bypass is fixed. | Handler plus installed SDK coverage. |
| Race remaining allowance | The actual installed limiter Lua admits one of 20 requests with one token left. New-record cap admits one of 20 with one slot left. | Real local Redis, Unix socket only, no persistence. |
| Malformed/oversized inputs | Empty, oversized, invalid type, duplicate ID, and invalid completion inputs return 400. Negative diagnostic counters clamp to zero. | Handler coverage. Vercel's HTTP JSON parser is not exercised. |
| External `next` redirect | Absolute, protocol-relative, and `@` values remain on the local origin. | Actual Chromium. No post-login redirect exists. |
| Stored XSS | Malicious feedback and League name/badge text produce zero injected nodes or alerts. An unsafe harness control triggers one alert. | Actual React components and browser. Feedback API uses fixtures. |
| SSRF | Inspected server fetches target fixed services. No arbitrary URL-import feature is found. | Not applicable to the inspected feature set. No internal-address request is sent. |
| Cache isolation | Actual service worker excludes `/api/`; fixture admin request returns 200, logged-out request returns 401. Separate browser context lacks A's saved state. | Browser cache scope verified. CDN isolation remains unproven. Feedback headers hardened. |
| Preview access | On 2026-11-12, Vercel preview protection is off. Previews are read-only by code: `isReadOnlyDeployment()` makes each write endpoint store nothing on a host other than the live site. Admin readers still require the owner's token. | Not a finding. No platform settings change or live preview attack occurs. |
| AI document injection | No app-facing AI, document ingestion, or tool-calling feature is found. | Not applicable; no runtime injection claimed. |

## Evidence and repeat the checks

- Access baseline and scope (private evidence), after transcript.
- Limits baseline (private evidence), Redis before, Redis after.
- Browser method and results (private evidence).

Before the next launch, rerun the saved security command. The combined run
passes 63 handler checks, seven actual Redis checks, and eight browser checks.
It requires installed project dependencies, local
Redis binaries, Chromium, and `flock`:

```bash
bash scripts/security-review.sh
```

Set `SECURITY_REDIS_RUNTIME` when Redis binaries are outside `PATH`.
Set `PLAYWRIGHT_CHROMIUM_PATH` when Chromium is outside `/usr/bin/chromium`.
This command fails if a required component is missing. It does not silently
skip checks. Outputs default to ignored `.audit/security-review/`.

After the fixes, a local mutation control removes the endpoint budget binding
and feedback `no-store` header. The two retained assertions fail. Restoring both
protections makes them pass. Both files are restored exactly. The Redis script
also executes the extracted baseline and fixed Lua separately. No cloud
protection is disabled.

The repository's full check run and release status are recorded in
`verification.md` beside this report when complete. These are server-only
behavior changes. The repository's browser-rendering diff cannot observe
serverless APIs; actual handler, Redis, and targeted browser checks provide the
change-specific evidence.

## Remaining boundaries

Anonymous telemetry is untrusted. A client can fabricate new identities or
claims. Knowing another CID permits targeted analytics pollution, but no public
CID enumeration was demonstrated. A signed-identity system would need a separate
privacy and migration design, and would still permit fabricated new identities.
Do not use these records as authenticated ownership or billing evidence.

The admin throttle intentionally runs before authentication. Requests from the
same IP share its window. Invalid requests can consume that window and incur
limiter operations; no global lockout or credential bypass was demonstrated.

Preview protection is intentionally disabled for PageSpeed Insights, according
to Michael. No runtime platform-access probe is claimed. Deployed edge-header
normalization, platform JSON parsing, CDN behavior, and live provider
configuration remain unverified.
The review does not certify production security from local results.

No accounts were created. Browser contexts and the isolated Redis process are
closed after probes. No production data or dashboard setting changes occur.

## Changes to the proposed process

- Use generated local identities rather than inventing user accounts that the app does not support.
- Label handler, SDK, browser, and hosting evidence separately. Mocked Redis does not prove deployed Redis behavior.
- Retain the requested regression scripts. Protection-removal controls, if needed, stay in disposable local copies.
- Never disable cloud protections or change database settings to prove a test.
- The quoted Anthropic plugin command targets Claude Code. It does not install an automatic Opus review in this Codex environment.

If you choose to use that plugin in Claude Code, open this repository there,
verify the marketplace publisher, and run the supplied command:
`/plugin install security-guidance@claude-plugins-official`.
Check the installed plugin's documentation for its actual hooks and model
requirements. This review does not verify its availability or establish that
installation alone reviews every edit, commit, or push. No plugin is installed
and no recurring review automation is configured by this task.
