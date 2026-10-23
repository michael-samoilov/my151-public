import { describe, expect, it } from 'vitest';
import { KEEP_MS, LIVE, planKept } from './keep-previous-assets';

const start = new Date('2026-10-01T12:00:00Z');
const at = (ms: number) => new Date(start.getTime() + ms);
const HOUR = 3_600_000;

describe('planKept', () => {
  it('keeps the live deploy\'s dropped files from now, and marks this build live', () => {
    const { next, keep } = planKept({ 'assets/old.js': LIVE, 'assets/same.js': LIVE }, ['assets/same.js', 'assets/new.js'], start);
    expect(keep).toEqual(['assets/old.js']);
    expect(next).toEqual({ 'assets/old.js': start.toISOString(), 'assets/same.js': LIVE, 'assets/new.js': LIVE });
  });

  it('counts the days from the deploy that dropped a file, not the one that built it', () => {
    const dropped = planKept({ 'assets/a.js': LIVE }, ['assets/b.js'], at(72 * HOUR)).next;
    expect(planKept(dropped, ['assets/c.js'], at(72 * HOUR + KEEP_MS - HOUR)).keep).toContain('assets/a.js');
  });

  it('ages a kept file from its drop, however many deploys follow, then drops it', () => {
    let list = planKept({ 'assets/a.js': LIVE }, ['assets/b.js'], start).next;
    for (const hours of [1, 50, 120]) list = planKept(list, [`assets/d${hours}.js`], at(hours * HOUR)).next;
    expect(list['assets/a.js']).toBe(start.toISOString());
    expect(planKept(list, ['assets/z.js'], at(KEEP_MS + 1)).next).not.toHaveProperty('assets/a.js');
  });

  it('lists the most recently dropped files first, so the size cap drops the oldest', () => {
    const { keep } = planKept({ 'assets/older.js': at(-2 * HOUR).toISOString(), 'assets/live.js': LIVE, 'assets/old.js': at(-HOUR).toISOString() }, [], start);
    expect(keep).toEqual(['assets/live.js', 'assets/old.js', 'assets/older.js']);
  });

  it('drops an entry whose time does not parse', () => {
    expect(planKept({ 'assets/bad.js': 'yesterday' }, ['assets/b.js'], start).keep).toEqual([]);
  });
});
