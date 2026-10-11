import type {VercelRequest, VercelResponse} from '@vercel/node';
import {redis, requireAdmin, firstQueryValue} from './_shared.js';
import {ARCHIVED_KEY} from './_archive.js';
import {loadMinuteActivityHistory} from './_activityHistoryStore.js';
import {reconstructMinuteActivity, type MinuteActivityTool} from './_minuteActivity.js';

const DAY = 86_400_000;
/** Bounded, explicit admin reads. Never part of an ordinary dashboard load. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error: 'Method not allowed'});
  try {
    if (!(await requireAdmin(req, res))) return;
    const query = (name: string) => firstQueryValue(req.query[name] as string | string[] | undefined);
    const now = Date.now();
    const date = (value: string) => {
      const time = Date.parse(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
    };
    const from = query('from') ? date(query('from')) : Math.floor(now / DAY) * DAY - 6 * DAY;
    const to = query('to') ? Math.min(now, date(query('to')) + DAY - 1) : now;
    const gapMinutes = query('gapMinutes') ? Number(query('gapMinutes')) : 5;
    const recordCid = query('cid'), cid = recordCid.split('::')[0], tool = query('tool');
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from ||
      Math.floor(to / DAY) - Math.floor(from / DAY) >= 31 ||
      !Number.isSafeInteger(gapMinutes * 60_000) || gapMinutes < 1 || gapMinutes > 1440 ||
      recordCid && !/^[-\w]{8,80}(?:::[A-Za-z0-9]{1,4})?$/.test(recordCid) || tool && !['dex', 'league', 'favorites'].includes(tool)) {
      return res.status(400).json({error: 'Use at most 31 UTC days and a gap of 1–1440 minutes'});
    }
    const [history, archived] = await Promise.all([
      loadMinuteActivityHistory(from, to, {cid: cid || undefined, tool: (tool || undefined) as MinuteActivityTool | undefined, cursor: query('cursor') || undefined}),
      redis.smembers<string[]>(ARCHIVED_KEY),
    ]);
    const excluded = new Set(archived.map(value => value.split('::')[0]));
    const batches = history.batches.filter(batch => !excluded.has(batch.cid));
    const totals = reconstructMinuteActivity(batches, gapMinutes * 60_000);
    // Truncated pages must be combined before computing a whole-range total.
    return res.status(200).json({
      coverage: {...history.coverage, completeness: 'unknown', consistency: 'best-effort scan', bucketCount: batches.reduce((n, b) => n + b.buckets.length, 0),
        status: history.truncated || query('cursor') || totals.incomplete ? 'partial' : batches.length ? 'recorded' : 'missing'},
      gapMinutes, totals: batches.length && !history.truncated && !query('cursor') ? totals : null,
      truncated: history.truncated, blockedPage: history.blockedPage, nextCursor: history.nextCursor,
      ...(query('raw') === '1' ? {batches} : {}),
    });
  } catch (error) {
    return res.status(error instanceof RangeError ? 400 : 500).json({error: error instanceof RangeError ? error.message : 'History unavailable'});
  }
}
