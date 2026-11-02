export interface TimelinePoint {
  t: number;
  count: number;
  net: number;
  added: number;
  removed: number;
  dur?: number;
  ev?: string[];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDay(t: number, tz?: string): string {
  const d = new Date(t);
  const zone = tz || 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: 'numeric' }).formatToParts(d);
  const month = parts.find((p) => p.type === 'month')?.value ?? MON[d.getUTCMonth()];
  const day = parts.find((p) => p.type === 'day')?.value ?? String(d.getUTCDate());
  return `${month} ${day}`;
}

function clockParts(t: number, tz?: string): { time: string; period: string } {
  const raw = new Date(t).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz || 'UTC',
  });
  const m = raw.match(/^(.*)\s([AP]M)$/);
  return m ? { time: m[1], period: m[2] } : { time: raw, period: '' };
}

export function fmtRange(start: number, end: number, tz?: string): string {
  const a = clockParts(start, tz);
  const b = clockParts(end, tz);
  if (a.period && a.period === b.period) return `${a.time}–${b.time} ${a.period}`;
  const left = a.period ? `${a.time} ${a.period}` : a.time;
  const right = b.period ? `${b.time} ${b.period}` : b.time;
  return `${left}–${right}`;
}

function zonedClock(t: number, tz: string): { hour: number; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(t));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  return { hour, minute, weekday };
}

export function midnightBoundaries(t0: number, t1: number, tz?: string): number[] {
  if (!tz) {
    const out: number[] = [];
    const d = new Date(t0);
    d.setUTCHours(0, 0, 0, 0);
    if (d.getTime() < t0) d.setUTCDate(d.getUTCDate() + 1);
    for (let ts = d.getTime(); ts <= t1; ts += 86_400_000) out.push(ts);
    return out;
  }
  // 15-minute steps catch offsets like IST (UTC+5:30), not only whole hours.
  const out: number[] = [];
  const zoneOffsetStepMs = 15 * 60_000;
  let t = Math.floor(t0 / zoneOffsetStepMs) * zoneOffsetStepMs;
  const end = t1 + zoneOffsetStepMs;
  let prevMidnight = false;
  for (; t <= end; t += zoneOffsetStepMs) {
    const { hour, minute } = zonedClock(t, tz);
    const isMidnight = hour === 0 && minute === 0;
    if (isMidnight && !prevMidnight && t >= t0 && t <= t1) out.push(t);
    prevMidnight = isMidnight;
  }
  return out;
}

export function weekBoundaries(t0: number, t1: number, tz?: string): number[] {
  const days = midnightBoundaries(t0, t1, tz);
  if (!tz) return days.filter((ts) => new Date(ts).getUTCDay() === 0);
  return days.filter((ts) => zonedClock(ts, tz).weekday === 'Sun');
}

export function showDayLines(t0: number, t1: number, tz?: string): boolean {
  return weekBoundaries(t0, t1, tz).length < 2;
}

function calendarDayKey(t: number, tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

export function distinctCalendarDays(timestamps: number[], tz?: string): number {
  const keys = new Set(timestamps.map((t) => calendarDayKey(t, tz)));
  return keys.size || (timestamps.length === 0 ? 0 : 1);
}

export function formatSessionMeta(cur: TimelinePoint, tz?: string): {
  date: string;
  window?: string;
  added?: number;
  removed?: number;
  diff: boolean;
  text: string;
} {
  const date = fmtDay(cur.t, tz);
  const window =
    cur.dur != null
      ? `${fmtRange(cur.t - cur.dur * 1000, cur.t, tz)} · ${Math.round(cur.dur / 60) ? `${Math.round(cur.dur / 60)}m` : `${Math.round(cur.dur)}s`}`
      : undefined;
  const added = cur.added > 0 ? cur.added : undefined;
  const removed = cur.removed > 0 ? cur.removed : undefined;
  const bits: string[] = [date];
  if (window) bits.push(window);
  if (added != null || removed != null) {
    bits.push([added != null ? `+${added}` : '', removed != null ? `−${removed}` : ''].filter(Boolean).join(' '));
  }
  return { date, window, added, removed, diff: added != null || removed != null, text: bits.join(' · ') };
}
