import {sanitizeRecordingFields, type RecordingFields} from './_sessionize.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash, timingSafeEqual } from 'node:crypto';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const CLIENTS_KEY = 'clients';
export const VERSION_KEY = 'clients:ver';
export const SESSION_GAP_MS = 30 * 60_000;
export const MAX_SESSIONS_TRACKED = 50;
export const MAX_CLIENTS = 50000;

export const BEACON_KINDS = ['progress', 'completion', 'export'] as const;
export type BeaconKind = (typeof BEACON_KINDS)[number];
export function isBeaconKind(s: string): s is BeaconKind {
  return (BEACON_KINDS as readonly string[]).includes(s);
}

export interface ClientRecord extends RecordingFields {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  submits: number;
  /** Number of distinct sessions (visits). A gap > SESSION_GAP_MS between
   *  beacons starts a new session. Absent on legacy records. */
  sessions?: number;
  curSessionStart?: number;
  maxSessionMs?: number;
  /** Duration (ms) of each session, in order; the last entry is the session
   *  currently in progress. Capped at the most recent MAX_SESSIONS_TRACKED.
   *  Absent on legacy records. */
  sessionMs?: number[];
  /** Peak depth (max evolution lines) reached within each session, parallel to
   *  sessionMs. Most-recent MAX_SESSIONS_TRACKED. Absent on legacy records. */
  sessionDepth?: number[];
  sessionLog?: {
    ts: number;
    ids: number[];
    country?: string;
    dev?: string;
    events?: string[];
    page?: string;
    /** The section placement (groupId -> ids) at this session's last build
     *  beacon, so the scrubber can regroup the build at that point, not just
     *  replay its flat ids. Carried forward within a session; absent on legacy
     *  sessions and on any session with no build beacon. */
    sections?: Record<string, number[]>;
  }[];
  maxDepth: number;
  /** Hour-of-day (0–23) in the user's own local time at their last submit. */
  localHour: number;
  /** Day-of-week (0=Sun…6=Sat) in the user's own local time at their last
   *  submit. Absent on records that predate the heatmap. */
  localDow?: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  /** The locale the app actually rendered in at the last beacon, as resolved
   *  client-side (`?lang=` > manual pick > browser). Distinct from `lang`,
   *  which is only the Accept-Language header. Absent on legacy records. */
  locale?: string;
  /** Locale the visitor pinned in the language picker. Absent when they still
   *  follow the browser (store.locale is null), and on every record written
   *  before this field existed. Lets admin tell "picked English" from
   *  "unsupported browser language fell back to English". */
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  /** Host of the external site that first linked this browser here — a coarse
   *  acquisition source (`reddit.com`, `t.co`). Set once, never overwritten
   *  (forward-only), and host-only by design: the path and query of a referring
   *  URL can carry personal data, so they are dropped, the same low-sensitivity
   *  rule as getGeo. Absent on direct visits, internal navigation, and every
   *  record written before the field existed. */
  firstReferrer?: string;
  /** Union of every Pokemon this client has ever placed, across all submits.
   *  Compared against latestIds to surface "tried then dropped" picks — the
   *  real adjustment signal (order-independent, starter-prompt-immune). */
  everIds: number[];
  /** Union, per section, of every Pokemon ever placed INTO that section
   *  (sectionId -> ids). Diffing against latestSections gives "dropped from
   *  section X". Absent on records that predate section tracking. */
  everSections?: Record<string, number[]>;
  latestIds: number[];
  /** The user's actual section placement at their last build beacon
   *  (groupId -> ids). Captures where they put each Pokemon, including
   *  non-default-for-that-section choices. Absent on legacy records. */
  latestSections?: Record<string, number[]>;
  completed: boolean;
  completedAt?: string;
  completedIds?: number[];
  exported: boolean;
  exportedAt?: string;
  exportedIds?: number[];
  /** The View settings in effect at the user's last export: which sort order,
   *  whether the build-section outlines overlay was on, and whether specials were
   *  grouped at the end. Absent on records that predate export-settings capture. */
  exportSettings?: {
    sort: string;
    outlines: boolean;
    groupSpecial: boolean;
    /** Whether the detailed-stats panel was included. Absent on older records. */
    showStats?: boolean;
  };
}

export function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function headerValue(req: VercelRequest, name: string): string | undefined {
  const v = req.headers[name];
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

const LIVE_HOSTS = new Set(['my151.app', 'www.my151.app']);

/** True on a Vercel deployment reached by any address but the live site: a
 *  preview, or a production deployment's own `*.vercel.app` URL. Only agents,
 *  reviewers, and tests visit those, so they record nothing. Local builds
 *  (no VERCEL_ENV) are never blocked. */
export function isReadOnlyDeployment(req: VercelRequest): boolean {
  const env = process.env.VERCEL_ENV;
  if (env !== 'preview' && env !== 'production') return false;
  const host = headerValue(req, 'x-forwarded-host') ?? headerValue(req, 'host') ?? '';
  return !LIVE_HOSTS.has(host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, ''));
}

export function getClientIp(req: VercelRequest): string {
  const real = headerValue(req, 'x-real-ip');
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Coarse geo from Vercel's IP headers. Country/region/timezone only — we
 *  deliberately skip city + lat/long to keep this low-sensitivity. Vercel's
 *  'XX' placeholder for an unknown country is normalized to undefined. */
export function getGeo(req: VercelRequest) {
  const country = headerValue(req, 'x-vercel-ip-country');
  return {
    country: country && country !== 'XX' ? country : undefined,
    region: headerValue(req, 'x-vercel-ip-country-region'),
    tz: headerValue(req, 'x-vercel-ip-timezone'),
  };
}

export function getLang(req: VercelRequest): string | undefined {
  const al = headerValue(req, 'accept-language');
  if (!al) return undefined;
  const first = al.split(',')[0]?.split(';')[0]?.trim();
  return first || undefined;
}

export function getClient(req: VercelRequest) {
  const ua = headerValue(req, 'user-agent') ?? '';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

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

export function parseLocale(v: unknown): string | undefined {
  return typeof v === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/i.test(v) ? v : undefined;
}

export function parseReferrerHost(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (s.length < 3 || s.length > 100) return undefined;
  if (!/^[a-z0-9.-]+$/.test(s)) return undefined;
  if (!s.includes('.')) return undefined;
  return s;
}

/**
 * Timing-safe token compare. Hashing both sides to a fixed-length digest before
 * `timingSafeEqual` means the comparison never short-circuits on length, so it
 * leaks neither content nor the token's length.
 */
function tokenEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(60, '1 m'),
  analytics: false,
  prefix: 'rl:admin',
});

/**
 * Gate an admin endpoint: rate-limit, then require a valid Bearer token. Writes
 * the appropriate error response and returns false when not authorized; returns
 * true when the caller may proceed. The token is accepted ONLY via the
 * Authorization header (never a query string) so it can't land in access logs.
 */
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(503).json({ error: 'Admin access not configured' });
    return false;
  }

  const ip = getClientIp(req);
  const { success, reset } = await adminLimiter.limit(ip);
  if (!success) {
    res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }

  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization ?? '';
  const provided = (authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '').trim();
  if (!provided || !tokenEqual(provided, adminToken.trim())) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** Parse a hash field value that may already be auto-parsed by the SDK. */
export function parseRecord(raw: unknown): ClientRecord | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return parseRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return sanitizeRecordingFields(raw as ClientRecord);
}
