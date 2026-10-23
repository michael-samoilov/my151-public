export type Status = 'pass' | 'fail' | 'skip';
export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

const CAPABILITY_SKIPS = {
  'desktop-blink-only': ['placement:real-add-grows-store', 'league:drive-writes-store'],
  'synthetic-touch-unavailable': ['league-change:flick-moves-stage', 'league-change:flick-washes-the-stage'],
  'hover-pointer-unavailable': ['league-hover:desktop-column-wash'],
  'desktop-pane': ['favorites:short-sheet', 'favorites:tall-selector-fits'],
} as const;

export interface Check {
  name: string;
  status: Status;
  detail?: string;
  skipReason?: keyof typeof CAPABILITY_SKIPS;
  /** Stable one-line keys for set-valued checks such as the render audit. */
  findings?: string[];
}

export interface SurfaceResult {
  surface: string;
  engine: string;
  persona: string | null;
  available: boolean;
  checks: Check[];
  screenshots: string[];
  videos?: string[];
  error?: string;
}

function permittedSkip(check: Check, surface: SurfaceResult): boolean {
  if (!check.skipReason || !check.detail?.trim()) return false;
  const names: readonly string[] = CAPABILITY_SKIPS[check.skipReason];
  if (!names.includes(check.name)) return false;
  if (check.skipReason === 'desktop-blink-only') return surface.engine !== 'blink' || surface.persona !== null;
  if (check.skipReason === 'desktop-pane') return surface.persona === null;
  return true;
}

export function coverageGaps(surfaces: SurfaceResult[]): string[] {
  if (surfaces.length === 0) return ['no surfaces requested'];
  return surfaces.flatMap((surface) => {
    if (!surface.available) return [`${surface.surface}:engine unavailable`];
    if (surface.checks.length === 0) return [`${surface.surface}:no checks ran`];
    const gaps = surface.checks
      .filter((check) => check.status === 'skip' && !permittedSkip(check, surface))
      .map((check) => `${surface.surface}:${check.name}:required check skipped${check.detail ? ` (${check.detail})` : ''}`);
    if (surface.checks.every((check) => check.status === 'skip')) gaps.unshift(`${surface.surface}:no checks ran`);
    return gaps;
  });
}

export function surfaceVerdict(surface: SurfaceResult): Status {
  if ((surface.error && surface.available) || surface.checks.some((check) => check.status === 'fail')) return 'fail';
  return coverageGaps([surface]).length ? 'skip' : 'pass';
}

export function rollup(surfaces: SurfaceResult[], regressions: string[], missingCoverage: string[] = []): Verdict {
  if (regressions.length || surfaces.some((surface) => surfaceVerdict(surface) === 'fail')) return 'FAIL';
  return missingCoverage.length || coverageGaps(surfaces).length ? 'INCONCLUSIVE' : 'PASS';
}

export function compareChecks(surface: string, before: Check[], after: Check[]): { regressions: string[]; missingCoverage: string[] } {
  const beforeMap = new Map(before.map((check) => [check.name, check]));
  const afterMap = new Map(after.map((check) => [check.name, check]));
  const regressions: string[] = [];
  const missingCoverage: string[] = [];
  for (const check of before) {
    if (check.status !== 'pass') continue;
    const current = afterMap.get(check.name);
    if (!current) missingCoverage.push(`${surface}:${check.name}:previously passing check disappeared`);
    else if (current.status === 'skip') missingCoverage.push(`${surface}:${check.name}:previously passing check skipped`);
  }
  for (const check of after) {
    const previous = beforeMap.get(check.name);
    if (check.status === 'fail' && previous?.status === 'pass') regressions.push(`${surface}:${check.name}`);
    const oldFindings = new Set(previous?.findings ?? []);
    const fresh = (check.findings ?? []).filter((key) => !oldFindings.has(key));
    if (fresh.length) regressions.push(`${surface}:${check.name}: ${fresh.length} new finding(s): ${fresh.slice(0, 3).join(' ; ')}`);
  }
  return { regressions, missingCoverage };
}
