import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import { SUBMIT_CLIENT_DAILY_CAP } from './_limits.js';
import { bumpDexPickFreq, parseNotmeFlag, recordToolExport } from './_exportStats.js';
import { parseFunnelEventList, parsePage, parseTool } from './_events.js';
import {
  redis,
  getClientIp,
  getClient,
  getGeo,
  getLang,
  parseLocale,
  parseReferrerHost,
  isBeaconKind,
  isReadOnlyDeployment,
  parseRecord,
  CLIENTS_KEY,
  MAX_CLIENTS,
  SESSION_GAP_MS,
  MAX_SESSIONS_TRACKED,
  VERSION_KEY,
  type BeaconKind,
  type ClientRecord,
} from './_shared.js';
import { alignSessionMs, isSubsetRegression, parseCapturedAt, sessionTarget } from './_sessionize.js';
import { EVOLUTION_CHAIN_BY_ID } from './_chains.js';

/** A Pokédex holds species and forms, such as Alolan Raichu (10100). The chain
 *  table is generated from src/data/pokemon.json, so its keys are exactly the
 *  ids a build can hold. A fixed 1025 ceiling rejected every beacon from a
 *  build with a form in it. */
function isDexId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && Object.hasOwn(EVOLUTION_CHAIN_BY_ID, id);
}

/** A Pokédex may grow past 151. Unique known ids bound a build, and a section,
 *  at this many entries. */
const DEX_ID_COUNT = Object.keys(EVOLUTION_CHAIN_BY_ID).length;

// Rate limiters: per-IP, analytics disabled to avoid doubling Upstash command count.
const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});
// Per-client write cap so one browser can't spam updates. Sized in
// _limits.ts from the client's own maximum send rate — a cap below that
// ceiling silences the most engaged users mid-session, which is a data-loss
// bug, not protection. (The old 120/day cut off anyone building for more than
// half an hour; a unit test now pins cadence × cap so they can't drift apart.)
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(SUBMIT_CLIENT_DAILY_CAP, '1 d'),
  analytics: false,
  prefix: 'rl:client',
});

// Compare-and-set on a version counter: write `next` to the record only if the
// record's version still equals the one we read (`expectedVer`); then bump the
// version. Returns 1 on success, 0 if another beacon wrote first (caller
// re-reads and retries). This makes the whole read-merge-write atomic across the
// completion/progress/export beacons a single browser fires within seconds of
// each other — without it they clobber one another (lost updates: missing
// export flag, wrong pick count, whole record dropped).
// KEYS[1]=clients hash  KEYS[2]=version hash
// ARGV[1]=cid  ARGV[2]=expectedVer  ARGV[3]=record JSON
const CAS_LUA = `
local cur = redis.call('HGET', KEYS[2], ARGV[1]) or '0'
if cur == ARGV[2] then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
  redis.call('HSET', KEYS[2], ARGV[1], tostring(tonumber(cur) + 1))
  return 1
end
return 0
`;

/** Hour-of-day (0–23) in the given IANA timezone, defaulting to UTC. */
function localHourIn(tz: string | undefined, when: number): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      hour: 'numeric',
      hour12: false,
    }).format(when);
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : new Date(when).getUTCHours();
  } catch {
    return new Date(when).getUTCHours();
  }
}

/** Day-of-week (0=Sun…6=Sat) in the given IANA timezone, defaulting to UTC. */
function localDowIn(tz: string | undefined, when: number): number {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'short' }).format(when);
    const i = names.indexOf(wd);
    return i >= 0 ? i : new Date(when).getUTCDay();
  } catch {
    return new Date(when).getUTCDay();
  }
}

/** Validate a non-empty build of unique known ids; returns the ids or null. */
function validIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > DEX_ID_COUNT) return null;
  const seen = new Set<number>();
  for (const id of ids) {
    if (!isDexId(id)) return null;
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return ids as number[];
}

/** Sanitize the per-section placement map (groupId -> ids). Caps section count
 *  and ids per section, and validates each id, so a hostile client can't bloat
 *  the record. Returns undefined when absent/invalid. */
function validSections(sections: unknown): Record<string, number[]> | undefined {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return undefined;
  const out: Record<string, number[]> = {};
  let groups = 0;
  for (const [key, val] of Object.entries(sections as Record<string, unknown>)) {
    if (groups >= 40 || typeof key !== 'string' || key.length > 40) break;
    if (!Array.isArray(val) || val.length === 0 || val.length > DEX_ID_COUNT) continue;
    const ids: number[] = [];
    for (const id of val) {
      if (isDexId(id)) ids.push(id);
    }
    if (ids.length > 0) {
      out[key] = ids;
      groups++;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Sanitize the export-settings object sent with an export beacon. Returns
 *  undefined when absent/invalid so a hostile client can't store junk. */
const VALID_SORTS = new Set(['build-order', 'regional', 'national', 'type', 'custom']);
function validExportSettings(
  v: unknown,
): { sort: string; outlines: boolean; groupSpecial: boolean; showStats: boolean } | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.sort !== 'string' || !VALID_SORTS.has(o.sort)) return undefined;
  return {
    sort: o.sort,
    outlines: o.outlines === true,
    groupSpecial: o.groupSpecial === true,
    showStats: o.showStats === true,
  };
}

/** Sanitize the buffered funnel-event list sent with a build beacon. */
function validEvents(v: unknown): string[] {
  return parseFunnelEventList(v);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (req.body ?? {}) as {
      cid?: unknown;
      kind?: unknown;
      ids?: unknown;
      depth?: unknown;
      sections?: unknown;
      exportSettings?: unknown;
      events?: unknown;
      locale?: unknown;
      switched?: unknown;
      ref?: unknown;
      tool?: unknown;
      page?: unknown;
      ts?: unknown;
      notme?: unknown;
    };

    // Client id: a UUID minted once per browser. Length-bounded to avoid abuse.
    if (typeof body.cid !== 'string' || body.cid.length < 8 || body.cid.length > 64) {
      return res.status(400).json({ error: 'invalid cid' });
    }
    const cid = body.cid;

    if (typeof body.kind !== 'string' || !isBeaconKind(body.kind)) {
      return res.status(400).json({ error: 'invalid kind' });
    }
    const kind: BeaconKind = body.kind;

    const ids = validIds(body.ids);
    if (!ids) return res.status(400).json({ error: 'Expected unique Pokémon IDs' });
    if (kind === 'completion' && ids.length !== 151) {
      return res.status(400).json({ error: 'Completion requires exactly 151 Pokemon IDs' });
    }

    const notme = parseNotmeFlag(body.notme);
    if (notme || isReadOnlyDeployment(req)) {
      if (kind === 'export') {
        const highlight = await recordToolExport('pokedex', ids, { notme: true });
        return res.status(200).json({ ok: true, highlight });
      }
      return res.status(200).json({ ok: true });
    }

    // Distinct evolution lines reached, computed client-side; clamp defensively.
    const depth =
      typeof body.depth === 'number' && Number.isFinite(body.depth)
        ? Math.max(0, Math.min(ids.length, Math.round(body.depth)))
        : ids.length;

    // Count the paths where a genuine beacon is dropped server-side, into the
    // funnel hash the admin already reads. "My friend's session never showed
    // up" is otherwise undiagnosable: these are the only drops the server can
    // see, so they must be the drops the server records. Counted only after a
    // rate-limit check has been paid for, so the counter itself is not a free
    // write for a hostile client.
    // The two limiters are separate keys, learned the hard way: a single
    // 'rate-limit' bucket showed 31 drops with no way to tell whether an IP
    // was bursting or real users were exhausting the per-client allowance.
    const countDrop = async (
      reason: 'rate-limit-ip' | 'rate-limit-client' | 'cap' | 'contention',
    ) => {
      try {
        await redis.hincrby('funnel', `submit-drop:${reason}`, 1);
      } catch {
        // the drop still happens; only its bookkeeping failed
      }
    };

    // Rate limit per IP + per client before touching state.
    const ip = getClientIp(req);
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      await countDrop('rate-limit-ip');
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    // Keyed per tool as well as per browser, so a person running two tools in
    // two tabs each cannot exhaust one budget with the other's beacons.
    const tool = parseTool(body.tool);
    const page = parsePage(body.page);
    const perClient = await clientLimiter.limit(`${tool}:${cid}`);
    if (!perClient.success) {
      await countDrop('rate-limit-client');
      res.setHeader('Retry-After', Math.ceil((perClient.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    const receivedAt = Date.now();
    const captured = parseCapturedAt(body.ts, receivedAt);
    const now = captured ?? receivedAt;
    const capturedKnown = captured !== null;
    const at = new Date(now).toISOString();
    const geo = getGeo(req);
    const ua = getClient(req);

    const secs = validSections(body.sections);
    const settings = kind === 'export' ? validExportSettings(body.exportSettings) : undefined;
    const newEvents = validEvents(body.events);
    // The locale the client actually rendered in, and any picker pin.
    const locale = parseLocale(body.locale);
    const switched = parseLocale(body.switched);
    // External referrer host, if the client sent one (host-only, forward-only).
    const ref = parseReferrerHost(body.ref);

    // Merge this beacon into an existing record (or seed a new one). Pure given
    // `existing`, so it can be re-run on retry after a concurrent write.
    const mergeRecord = (existing: ClientRecord | null, recCid: string): ClientRecord => {
      const rec: ClientRecord = existing ?? {
        cid: recCid,
        firstTs: now,
        firstAt: at,
        lastTs: now,
        lastAt: at,
        submits: 0,
        maxDepth: 0,
        localHour: 0,
        everIds: ids,
        latestIds: ids,
        completed: false,
        exported: false,
      };

      rec.submits += 1;
      rec.maxDepth = Math.max(rec.maxDepth, depth);
      rec.country = geo.country;
      rec.region = geo.region;
      rec.tz = geo.tz;
      rec.lang = getLang(req);
      if (locale) rec.locale = locale;
      if (switched) rec.switched = switched;
      if (ref && !rec.firstReferrer) rec.firstReferrer = ref;
      rec.device = ua.device;
      rec.os = ua.os;
      rec.browser = ua.browser;
      rec.everIds = Array.from(new Set([...(rec.everIds ?? []), ...ids])).sort((a, b) => a - b);
      if (secs) {
        const ever = rec.everSections ?? {};
        for (const [sid, sIds] of Object.entries(secs)) {
          ever[sid] = Array.from(new Set([...(ever[sid] ?? []), ...sIds])).slice(0, 200);
        }
        rec.everSections = ever;
      }
      if (kind === 'completion') {
        rec.completed = true;
        rec.completedAt = at;
        rec.completedIds = ids;
      } else if (kind === 'export') {
        rec.exported = true;
        rec.exportedAt = at;
        rec.exportedIds = ids;
        if (settings) rec.exportSettings = settings;
      }

      if (existing && rec.sessions === undefined) {
        rec.sessionMs = [Math.max(0, existing.lastTs - existing.firstTs)];
        rec.sessionLog = rec.sessionLog ?? [{ ts: existing.lastTs, ids: existing.latestIds }];
        rec.sessions = 1;
        rec.curSessionStart = existing.firstTs;
      }

      const log = [...(rec.sessionLog ?? [])];
      const ms = alignSessionMs(log.length, rec.sessionMs ?? []);
      const depths = alignSessionMs(log.length, rec.sessionDepth ?? []);
      const devStamp = [ua.device, ua.os, ua.browser].filter((p) => p && p !== 'Unknown').join(' · ');

      const makeEntry = (ts: number, prev?: (typeof log)[number]) => {
        const mergedEvents = [...(prev?.events ?? [])];
        for (const e of newEvents) if (!mergedEvents.includes(e)) mergedEvents.push(e);
        const sessionSecs = secs ?? prev?.sections;
        return {
          ts,
          ids,
          country: geo.country,
          ...(page ? { page } : {}),
          ...(devStamp ? { dev: devStamp } : {}),
          ...(mergedEvents.length ? { events: mergedEvents } : {}),
          ...(sessionSecs ? { sections: sessionSecs } : {}),
        };
      };

      if (log.length === 0) {
        log.push(makeEntry(now));
        ms.push(0);
        depths.push(depth);
        rec.sessions = 1;
        rec.curSessionStart = now;
      } else {
        const target = sessionTarget(
          log.map((s) => s.ts),
          ms,
          now,
          SESSION_GAP_MS,
        );
        if (
          target.kind === 'insert' &&
          !capturedKnown &&
          existing &&
          isSubsetRegression(ids, rec.latestIds ?? [])
        ) {
          rec.sessionLog = log;
          rec.sessionMs = ms;
          rec.sessionDepth = depths;
          if (now > rec.lastTs) {
            rec.lastTs = now;
            rec.lastAt = at;
            rec.localHour = localHourIn(geo.tz, now);
            rec.localDow = localDowIn(geo.tz, now);
          }
          return rec;
        }
        if (target.kind === 'join') {
          const i = target.index;
          if (now >= log[i].ts) {
            const start = log[i].ts - ms[i];
            const newEnd = Math.max(log[i].ts, now);
            ms[i] = Math.max(0, newEnd - start);
            depths[i] = depth;
            log[i] = makeEntry(newEnd, log[i]);
          }
        } else {
          log.splice(target.index, 0, makeEntry(now));
          ms.splice(target.index, 0, 0);
          depths.splice(target.index, 0, depth);
          rec.sessions = (rec.sessions ?? 0) + 1;
        }
      }

      const overflow = log.length - MAX_SESSIONS_TRACKED;
      rec.sessionLog = overflow > 0 ? log.slice(overflow) : log;
      rec.sessionMs = overflow > 0 ? ms.slice(overflow) : ms;
      rec.sessionDepth = overflow > 0 ? depths.slice(overflow) : depths;
      rec.maxSessionMs = rec.sessionMs.reduce((m, n) => Math.max(m, n), rec.maxSessionMs ?? 0);

      if (now >= rec.lastTs) {
        rec.lastTs = now;
        rec.lastAt = at;
        rec.latestIds = ids;
        rec.localHour = localHourIn(geo.tz, now);
        rec.localDow = localDowIn(geo.tz, now);
        if (secs) rec.latestSections = secs;
        const last = rec.sessionLog.length - 1;
        rec.curSessionStart = rec.sessionLog[last].ts - rec.sessionMs[last];
      } else {
        rec.firstTs = Math.min(rec.firstTs, now);
        rec.firstAt = new Date(rec.firstTs).toISOString();
      }
      return rec;
    };

    // Decide the record key once, based on the original cid's current record.
    // Multi-user CID collision: a submission from a different country whose picks
    // barely overlap the existing build is almost certainly a different person on
    // the same browser/CID (shared device) — route to a country-keyed record.
    const rawExisting = parseRecord(await redis.hget(CLIENTS_KEY, cid));
    let effectiveCid = cid;
    if (rawExisting && geo.country && rawExisting.country && geo.country !== rawExisting.country) {
      const existingSet = new Set(rawExisting.latestIds);
      const overlap = ids.filter((id) => existingSet.has(id)).length;
      const union = new Set([...rawExisting.latestIds, ...ids]).size;
      const jaccard = union > 0 ? overlap / union : 1;
      if (jaccard < 0.2) effectiveCid = `${cid}::${geo.country}`;
    }

    // Atomic read-merge-write with optimistic-concurrency retry. Each attempt
    // reads the record + its version, merges, then CAS-writes only if the
    // version is unchanged — so concurrent completion/progress/export beacons
    // from the same browser can't clobber each other.
    for (let attempt = 0; attempt < 6; attempt++) {
      const [rawStr, verStr] = await Promise.all([
        redis.hget(CLIENTS_KEY, effectiveCid) as Promise<unknown>,
        redis.hget(VERSION_KEY, effectiveCid) as Promise<string | number | null>,
      ]);
      const existing = parseRecord(rawStr);
      const expectedVer = verStr == null ? '0' : String(verStr);

      // Cap distinct clients; new clients past the cap are dropped.
      if (!existing) {
        const count = await redis.hlen(CLIENTS_KEY);
        if (count >= MAX_CLIENTS) {
          await countDrop('cap');
          return res.status(200).json({ ok: true, capped: true });
        }
      }

      const rec = mergeRecord(existing, effectiveCid);
      const ok = await redis.eval(
        CAS_LUA,
        [CLIENTS_KEY, VERSION_KEY],
        [effectiveCid, expectedVer, JSON.stringify(rec)],
      );
      if (ok === 1) {
        const prevEver = new Set(existing?.everIds ?? []);
        const newlyEver = rec.everIds.filter((id) => !prevEver.has(id));
        if (newlyEver.length > 0) await bumpDexPickFreq(newlyEver);
        if (kind === 'export') {
          const highlight = await recordToolExport('pokedex', ids);
          return res.status(200).json({ ok: true, highlight });
        }
        return res.status(200).json({ ok: true });
      }
      // Lost the race — brief backoff, then re-read and retry.
      await new Promise((r) => setTimeout(r, 15 + attempt * 20));
    }
    // Exhausted retries under heavy contention; report success (best-effort
    // analytics) rather than erroring the client.
    await countDrop('contention');
    return res.status(200).json({ ok: true, contended: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
