const ROUTE_LABELS: Record<string, string> = {
  home: 'Hub',
  builder: 'Dex builder',
  view: 'Dex view',
  league: 'Gym leader maker',
  'league-card': 'Gym leader card',
  analytics: 'Analytics',
  unknown: 'Unknown',
};

interface RouteCount {
  route: string;
  label: string;
  last7: number;
  last30: number;
}

interface Reported {
  ts: number;
  context?: Record<string, unknown>;
}

export function routeCounts(items: Reported[], now = Date.now()): RouteCount[] {
  const day = 86_400_000;
  const totals = new Map<string, { last7: number; last30: number }>();
  for (const item of items) {
    const age = now - item.ts;
    if (age > 30 * day || age < 0) continue;
    const raw = item.context?.route;
    const route = typeof raw === 'string' && raw ? raw : 'unknown';
    let t = totals.get(route);
    if (!t) totals.set(route, (t = { last7: 0, last30: 0 }));
    t.last30 += 1;
    if (age <= 7 * day) t.last7 += 1;
  }
  return [...totals.entries()]
    .map(([route, t]) => ({ route, label: ROUTE_LABELS[route] ?? route, ...t }))
    .sort((a, b) => b.last30 - a.last30 || (a.label < b.label ? -1 : 1));
}
