/**
 * Rate-limit budgets shared between the API and the client's beacon policy.
 *
 * This file must stay dependency-free: `src/lib/beaconScheduler.test.ts`
 * imports it to prove the client's maximum send rate fits inside the server's
 * per-client allowance. That test is the guard against the bug where the
 * client's beacon cadence and the server's daily cap were tuned separately
 * until real sessions collided with the cap — 31 beacons from live users were
 * dropped as `rate-limit` before the collision was noticed.
 *
 * The leading underscore keeps Vercel from serving this file as a route.
 */

/**
 * Beacons one client may submit per day.
 *
 * Sized from the client's own ceiling, not from a guess about "reasonable"
 * usage: the beacon debouncer fires at most once per PROGRESS_MAX_WAIT_MS, so
 * one tab editing continuously all day sends 1,440. Two full-time tabs on one
 * cid send 2,880. The cap sits above that with margin, because its job is to
 * stop a hostile script from spamming Redis — not to silence the most engaged
 * real users, which is exactly what the old cap of 120 did to anyone who built
 * for more than half an hour.
 */
export const SUBMIT_CLIENT_DAILY_CAP = 3000;

/**
 * The cap is per tool as well as per browser: /api/submit keys its limiter
 * by `dex:<cid>` and /api/league by `league:<cid>`. Two tools in two tabs
 * each would otherwise send 5,760 a day against one 3,000 budget, and the
 * dex builder's beacons would start dropping because the gym leader maker
 * was open in another tab. Each tool's own ceiling is what the test holds.
 */
