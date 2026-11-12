import {sanitizeRecordingFields, type RecordingFields} from './_sessionize.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const CLIENTS_KEY = 'clients';
export const VERSION_KEY = 'clients:ver';
export const SESSION_GAP_MS = 30 * 60_000;
export const MAX_SESSIONS_TRACKED = 50;
export const MAX_CLIENTS = 50000;
export const CLIENTS_ALERT_AT = 40000;
export const NEW_CLIENTS_PER_NETWORK_PER_DAY = 20;
export const MAX_BEACON_BODY_BYTES = 64 * 1024;
export const CLIENT_ID_PATTERN = /^[\w-]{8,64}$/;

export function parseClientId(v: unknown): string | undefined {
  return typeof v === 'string' && CLIENT_ID_PATTERN.test(v) ? v : undefined;
}

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
  sessions?: number;
  curSessionStart?: number;
  maxSessionMs?: number;
  sessionMs?: number[];
  sessionDepth?: number[];
  sessionLog?: {
    ts: number;
    ids: number[];
    country?: string;
    dev?: string;
    events?: string[];
    page?: string;
    sections?: Record<string, number[]>;
  }[];
  maxDepth: number;
  localHour: number;
  localDow?: number;
  country?: string;
  region?: string;
  tz?: string;
  lang?: string;
  locale?: string;
  switched?: string;
  device?: string;
  os?: string;
  browser?: string;
  firstReferrer?: string;
  everIds: number[];
  everSections?: Record<string, number[]>;
  latestIds: number[];
  latestSections?: Record<string, number[]>;
  completed: boolean;
  completedAt?: string;
  completedIds?: number[];
  exported: boolean;
  exportedAt?: string;
  exportedIds?: number[];
  exportSettings?: {
    sort: string;
    outlines: boolean;
    groupSpecial: boolean;
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

export function isReadOnlyDeployment(req: VercelRequest): boolean {
  const env = process.env.VERCEL_ENV;
  if (env !== 'preview' && env !== 'production') return false;
  const host = headerValue(req, 'host') ?? '';
  return !LIVE_HOSTS.has(host.toLowerCase().replace(/:\d+$/, ''));
}

function getClientIp(req: VercelRequest): string {
  const real = headerValue(req, 'x-real-ip');
  if (real) return real;
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

function ipv6Prefix64(ip: string): string {
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':');
}

const INSTANCE_NETWORK_SECRET = randomBytes(32);

function networkSecret(): Buffer {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return INSTANCE_NETWORK_SECRET;
  return Buffer.from(hkdfSync('sha256', adminToken, '', 'my151 network key v1', 32));
}

export function getNetworkKey(req: VercelRequest): string {
  const ip = getClientIp(req).replace(/%.*$/, '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const network = isIPv6(ip) ? `${ipv6Prefix64(ip)}::/64` : ip;
  return createHmac('sha256', networkSecret()).update(network).digest('hex').slice(0, 24);
}

export function bodyTooLarge(req: VercelRequest, max = MAX_BEACON_BODY_BYTES): boolean {
  const declared = Number(headerValue(req, 'content-length'));
  if (Number.isFinite(declared) && declared > max) return true;
  const body: unknown = req.body;
  if (body == null) return false;
  if (typeof body === 'string') return Buffer.byteLength(body) > max;
  if (Buffer.isBuffer(body)) return body.length > max;
  return Buffer.byteLength(JSON.stringify(body)) > max;
}

export type ClientTool = 'dex' | 'league' | 'favorites';

export async function admitNewClient(req: VercelRequest, tool: ClientTool, now = Date.now()): Promise<boolean> {
  const key = `newcid:${tool}:${new Date(now).toISOString().slice(0, 10)}:${getNetworkKey(req)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 2 * 86_400);
  return count <= NEW_CLIENTS_PER_NETWORK_PER_DAY;
}

export async function noteNewClient(recordsKey: string, tool: ClientTool): Promise<void> {
  try {
    if ((await redis.hlen(recordsKey)) >= CLIENTS_ALERT_AT) await redis.hincrby('funnel', `clients-near-cap:${tool}`, 1);
  } catch (err) {
    console.error('Client count alert error:', err);
  }
}

// platform: Vercel sends the placeholder 'XX' as the country when it does not know it.
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

// platform: Node's timingSafeEqual throws on unequal lengths, so both sides hash to fixed-length digests and the length never leaks.
function tokenEqual(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerMatches(req: VercelRequest, expected: string): boolean {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization ?? '';
  const provided = (authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '').trim();
  return provided !== '' && tokenEqual(provided, expected.trim());
}

const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(60, '1 m'),
  analytics: false,
  prefix: 'rl:admin',
});

export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(503).json({ error: 'Admin access not configured' });
    return false;
  }

  const { success, reset } = await adminLimiter.limit(getNetworkKey(req));
  if (!success) {
    res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }

  if (!bearerMatches(req, adminToken)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// platform: The Upstash SDK may already parse a hash field value from JSON.
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
