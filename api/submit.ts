import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Ratelimit } from '@upstash/ratelimit';
import {
  redis,
  getClientIp,
  isBeaconKind,
  parseRecord,
  CLIENTS_KEY,
  MAX_CLIENTS,
  SESSION_GAP_MS,
  MAX_SESSIONS_TRACKED,
  type BeaconKind,
  type ClientRecord,
} from './_shared.js';

const MAX_POKEMON_ID = 1025;

// Rate limiters: per-IP, analytics disabled to avoid doubling Upstash command count.
const burstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, '10 m'),
  analytics: false,
  prefix: 'rl:burst',
});
// Per-client write cap so one browser can't spam updates.
const clientLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '1 d'),
  analytics: false,
  prefix: 'rl:client',
});

function header(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name];
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/** Coarse geo from Vercel's IP headers. Country/region/timezone only — we
 *  deliberately skip city + lat/long to keep this low-sensitivity. Vercel's
 *  'XX' placeholder for an unknown country is normalized to undefined. */
function getGeo(req: VercelRequest) {
  const country = header(req, 'x-vercel-ip-country');
  return {
    country: country && country !== 'XX' ? country : undefined,
    region: header(req, 'x-vercel-ip-country-region'),
    tz: header(req, 'x-vercel-ip-timezone'),
  };
}

function getLang(req: VercelRequest): string | undefined {
  const al = header(req, 'accept-language');
  if (!al) return undefined;
  const first = al.split(',')[0]?.split(';')[0]?.trim();
  return first || undefined;
}

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

/** Best-effort device/browser/OS classification from the User-Agent string. */
function getClient(req: VercelRequest) {
  const ua = header(req, 'user-agent') ?? '';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

  // Order matters: Edge/Opera/CriOS UAs also contain "Chrome"; Chrome/Edge
  // also contain "Safari"; check the more specific tokens first.
  let browser = 'Unknown';
  if (/Edg(?:A|iOS)?\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  const device = /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)
    ? 'Mobile'
    : /iPad|Tablet|Android/i.test(ua)
      ? 'Tablet'
      : 'Desktop';

  return { device, os, browser };
}

/** Validate a 1–151 unique-id build array; returns the ids or null. */
function validIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 151) return null;
  const seen = new Set<number>();
  for (const id of ids) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) return null;
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
    if (!Array.isArray(val) || val.length === 0 || val.length > 151) continue;
    const ids: number[] = [];
    for (const id of val) {
      if (typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= MAX_POKEMON_ID) ids.push(id);
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
): { sort: string; outlines: boolean; groupSpecial: boolean } | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.sort !== 'string' || !VALID_SORTS.has(o.sort)) return undefined;
  return {
    sort: o.sort,
    outlines: o.outlines === true,
    groupSpecial: o.groupSpecial === true,
  };
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
    if (!ids) return res.status(400).json({ error: 'Expected 1-151 Pokemon IDs' });
    if (kind === 'completion' && ids.length !== 151) {
      return res.status(400).json({ error: 'Completion requires exactly 151 Pokemon IDs' });
    }

    // Distinct evolution lines reached, computed client-side; clamp defensively.
    const depth =
      typeof body.depth === 'number' && Number.isFinite(body.depth)
        ? Math.max(0, Math.min(151, Math.round(body.depth)))
        : ids.length;

    // Rate limit per IP + per client before touching state.
    const ip = getClientIp(req);
    const burst = await burstLimiter.limit(ip);
    if (!burst.success) {
      res.setHeader('Retry-After', Math.ceil((burst.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }
    const perClient = await clientLimiter.limit(cid);
    if (!perClient.success) {
      res.setHeader('Retry-After', Math.ceil((perClient.reset - Date.now()) / 1000));
      return res.status(429).json({ error: 'Too many requests' });
    }

    const now = Date.now();
    const at = new Date(now).toISOString();
    const geo = getGeo(req);
    const ua = getClient(req);

    // Read-merge-write this client's record. Concurrent writes from the *same*
    // browser are effectively impossible, so a transaction isn't needed.
    const rawExisting = parseRecord(await redis.hget(CLIENTS_KEY, cid));

    // Detect multi-user CID collision: if the incoming submission is from a
    // different country AND the Pokemon picks barely overlap the existing build,
    // this is almost certainly a different person sharing the same browser/CID
    // (shared device, internet café, etc.). Route to a country-keyed record so
    // each person gets their own analytics entry.
    let effectiveCid = cid;
    let existing = rawExisting;
    if (
      rawExisting &&
      geo.country &&
      rawExisting.country &&
      geo.country !== rawExisting.country
    ) {
      const existingSet = new Set(rawExisting.latestIds);
      const overlap = ids.filter((id) => existingSet.has(id)).length;
      const union = new Set([...rawExisting.latestIds, ...ids]).size;
      const jaccard = union > 0 ? overlap / union : 1;
      if (jaccard < 0.2) {
        effectiveCid = `${cid}::${geo.country}`;
        existing = parseRecord(await redis.hget(CLIENTS_KEY, effectiveCid));
      }
    }

    // Cap the number of distinct clients we track. New clients past the cap are
    // dropped; already-known clients keep updating.
    if (!existing) {
      const count = await redis.hlen(CLIENTS_KEY);
      if (count >= MAX_CLIENTS) return res.status(200).json({ ok: true, capped: true });
    }

    const rec: ClientRecord = existing ?? {
      cid: effectiveCid,
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

    // Sessionize: a gap > SESSION_GAP_MS since the previous beacon starts a new
    // session; otherwise we're still in the same sitting and extend it. Legacy
    // records (no session fields) are seeded from their existing first/last so
    // their history counts as one prior session.
    const gap = existing ? now - existing.lastTs : 0;
    // newSession = this beacon begins a fresh sitting (append a new duration);
    // otherwise it extends the in-progress one (update the last duration).
    let newSession: boolean;
    if (!existing) {
      // Brand-new client: first session starts now.
      rec.sessions = 1;
      rec.curSessionStart = now;
      rec.sessionMs = [];
      newSession = true;
    } else if (rec.sessions === undefined) {
      // First beacon since sessionization shipped on an older record: treat the
      // legacy first→last span as one prior session, then continue or start anew.
      const legacySpan = Math.max(0, existing.lastTs - existing.firstTs);
      rec.sessionMs = [legacySpan];
      if (gap > SESSION_GAP_MS) {
        rec.sessions = 2;
        rec.curSessionStart = now;
        newSession = true;
      } else {
        rec.sessions = 1;
        rec.curSessionStart = existing.firstTs;
        newSession = false;
      }
    } else if (gap > SESSION_GAP_MS) {
      // A long idle gap ends the prior sitting and begins a new one.
      rec.sessions += 1;
      rec.curSessionStart = now;
      newSession = true;
    } else {
      newSession = false;
    }

    const curSessionMs = Math.max(0, now - (rec.curSessionStart ?? now));
    rec.maxSessionMs = Math.max(rec.maxSessionMs ?? 0, curSessionMs);
    // Maintain the per-session duration list (cap at the most recent N).
    const list = rec.sessionMs ?? [];
    if (newSession) list.push(curSessionMs);
    else if (list.length > 0) list[list.length - 1] = curSessionMs;
    else list.push(curSessionMs);
    rec.sessionMs = list.slice(-MAX_SESSIONS_TRACKED);
    // Parallel per-session end-state snapshot, for visit-to-visit diffs.
    const log = rec.sessionLog ?? [];
    if (newSession || log.length === 0) log.push({ ts: now, ids, country: geo.country });
    else log[log.length - 1] = { ts: now, ids, country: geo.country };
    rec.sessionLog = log.slice(-MAX_SESSIONS_TRACKED);

    rec.lastTs = now;
    rec.lastAt = at;
    rec.submits += 1;
    rec.maxDepth = Math.max(rec.maxDepth, depth);
    rec.localHour = localHourIn(geo.tz, now);
    rec.localDow = localDowIn(geo.tz, now);
    rec.latestIds = ids;
    // The user's actual section placement (groupId -> ids), if provided. Lets
    // the admin see where Pokemon were placed — including non-default choices.
    // Forward-only: absent on records that predate this.
    const secs = validSections(body.sections);
    if (secs) {
      rec.latestSections = secs;
      // Accumulate the union of ids ever placed into each section, so the admin
      // can compute "dropped from section X" = ever-in-X minus currently-in-X.
      const ever = rec.everSections ?? {};
      for (const [sid, sIds] of Object.entries(secs)) {
        ever[sid] = Array.from(new Set([...(ever[sid] ?? []), ...sIds])).slice(0, 200);
      }
      rec.everSections = ever;
    }
    // Accumulate every Pokemon ever placed (bounded; ids are 1..1025).
    rec.everIds = Array.from(new Set([...(rec.everIds ?? []), ...ids])).sort((a, b) => a - b);
    // Refresh request-derived context on every submit (latest wins).
    rec.country = geo.country;
    rec.region = geo.region;
    rec.tz = geo.tz;
    rec.lang = getLang(req);
    rec.device = ua.device;
    rec.os = ua.os;
    rec.browser = ua.browser;

    if (kind === 'completion') {
      rec.completed = true;
      rec.completedAt = at;
      rec.completedIds = ids;
    } else if (kind === 'export') {
      rec.exported = true;
      rec.exportedAt = at;
      rec.exportedIds = ids;
      const settings = validExportSettings(body.exportSettings);
      if (settings) rec.exportSettings = settings;
    }

    await redis.hset(CLIENTS_KEY, { [effectiveCid]: JSON.stringify(rec) });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
