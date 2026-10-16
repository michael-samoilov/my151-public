export const ARCHIVED_KEY = 'clients:archived';

export function bareCid(cid: string): string {
  const i = cid.indexOf('::');
  return i === -1 ? cid : cid.slice(0, i);
}

export function asArchivedSet(raw: unknown): Set<string> {
  const list = Array.isArray(raw) ? raw : [];
  return new Set(list.map((x) => bareCid(String(x))));
}

export function isArchived(cid: string, archived: Set<string>): boolean {
  return archived.has(bareCid(cid));
}

export function withoutArchived<T extends { cid: string }>(rows: T[], archived: Set<string>): T[] {
  if (archived.size === 0) return rows;
  return rows.filter((r) => !isArchived(r.cid, archived));
}
