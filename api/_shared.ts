// Shared helpers for the analytics API endpoints. The leading underscore keeps
// Vercel from treating this file as its own serverless route.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash, timingSafeEqual } from 'node:crypto';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// One record per anonymous client, stored in a single Redis hash keyed by the
// client id. Every aggregate (counts, histograms, popular Pokemon, country /
// device tallies, retention) is computed on read from these records — there are
// no separate counters to drift, and a person's repeated saves overwrite their
// own record (dedup) rather than appending new events.
export const CLIENTS_KEY = 'clients';
// Bound the hash so it can't grow without limit. New clients past this cap are
// simply not recorded (existing clients keep updating).
export const MAX_CLIENTS = 50000;

// What triggered a beacon. 'progress' is the running build state (used for
// retention + max-depth); 'completion'/'export' additionally flag the milestone
// and capture that specific build.
export const BEACON_KINDS = ['progress', 'completion', 'export'] as const;
export type BeaconKind = (typeof BEACON_KINDS)[number];
export function isBeaconKind(s: string): s is BeaconKind {
  return (BEACON_KINDS as readonly string[]).includes(s);
}

/** A single anonymous user's profile, merged across all their submissions. */
export interface ClientRecord {
  cid: string;
  firstTs: number;
  firstAt: string;
  lastTs: number;
  lastAt: string;
  /** How many beacons this client has sent (≈ how much they fiddled). */
  submits: number;
  /** Deepest build (distinct evolution lines) ever reached. */
  maxDepth: number;
  /** Hour-of-day (0–23) in the user's own local time at their last submit. */
  localHour: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  device?: string;
  os?: string;
  browser?: string;
  /** Earliest build we saw from this client (their "initial engagement"). */
  firstIds: number[];
  /** Most recent build (their "final dex"). */
  latestIds: number[];
  completed: boolean;
  completedAt?: string;
  completedIds?: number[];
  exported: boolean;
  exportedAt?: string;
  exportedIds?: number[];
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

/**
 * Best-effort client IP. Prefers `x-real-ip`, which Vercel's edge sets to the
 * actual connecting peer and a client cannot forge, over the leftmost
 * `x-forwarded-for` value (which IS client-supplied and would let an attacker
 * mint a fresh rate-limit bucket per request by rotating the header).
 */
export function getClientIp(req: VercelRequest): string {
  const real = headerValue(req, 'x-real-ip');
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
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

// Throttle the admin endpoints per IP so a leaked/guessed token can't be used
// to hammer reads or destructive resets/deletes unbounded.
const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
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
  // Trim both sides so a stray newline/space pasted into the Vercel env var (or
  // the header) can't cause a silent mismatch.
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
      return JSON.parse(raw) as ClientRecord;
    } catch {
      return null;
    }
  }
  return raw as ClientRecord;
}
