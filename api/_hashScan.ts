import { redis } from './_shared.js';

export const HASH_SCAN_PAGE_FIELDS = 200;

export async function readHashInPages(key: string): Promise<Record<string, unknown>> {
  const fields: Record<string, unknown> = {};
  let cursor = '0';
  do {
    const [next, flat] = await redis.hscan(key, cursor, { count: HASH_SCAN_PAGE_FIELDS });
    for (let i = 0; i + 1 < flat.length; i += 2) fields[String(flat[i])] = flat[i + 1];
    cursor = String(next);
  } while (cursor !== '0');
  return fields;
}
