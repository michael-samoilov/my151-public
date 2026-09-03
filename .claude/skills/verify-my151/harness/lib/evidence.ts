// Evidence for a run: per-surface invariant records, screenshots, and one
// verdict file. Screenshots are proof for a human or agent to inspect, not an
// auto-diff baseline; this repo rejects pixel snapshots on purpose.
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './servers.ts';

export type Status = 'pass' | 'fail' | 'skip';

export interface Check {
  name: string;
  status: Status;
  detail?: string;
  /** Stable one-line keys, for checks whose result is a set (the render audit). Diff mode names new members as regressions. */
  findings?: string[];
}

export interface SurfaceResult {
  surface: string; // e.g. "blink", "blink:ios-safari", "webkit", "gecko"
  engine: string;
  persona: string | null;
  available: boolean;
  checks: Check[];
  screenshots: string[];
  error?: string;
}

export interface RunReport {
  mode: 'absolute' | 'diff';
  base?: string;
  startedAt: string;
  surfaces: SurfaceResult[];
  regressions: string[]; // diff mode: named before/after deltas
  verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
}

export const EVIDENCE_ROOT = path.join(REPO_ROOT, '.claude/skills/verify-my151/evidence');

export class Evidence {
  readonly dir: string;
  constructor(readonly runId: string) {
    this.dir = path.join(EVIDENCE_ROOT, runId);
    fs.mkdirSync(this.dir, { recursive: true });
  }
  shotPath(surface: string, label: string): string {
    return path.join(this.dir, `${surface.replace(/[^a-z0-9-]/gi, '_')}--${label}.png`);
  }
  writeSurface(r: SurfaceResult): void {
    fs.writeFileSync(path.join(this.dir, `${r.surface.replace(/[^a-z0-9-]/gi, '_')}.json`), JSON.stringify(r, null, 2));
  }
  writeReport(r: RunReport): string {
    const file = path.join(this.dir, 'report.json');
    fs.writeFileSync(file, JSON.stringify(r, null, 2));
    return file;
  }
}

export function surfaceVerdict(r: SurfaceResult): Status {
  if (!r.available) return 'skip';
  if (r.error) return 'fail';
  return r.checks.some((c) => c.status === 'fail') ? 'fail' : 'pass';
}

export function rollup(surfaces: SurfaceResult[], regressions: string[]): RunReport['verdict'] {
  const graded = surfaces.filter((s) => s.available);
  if (graded.length === 0) return 'INCONCLUSIVE';
  const anyFail = graded.some((s) => surfaceVerdict(s) === 'fail') || regressions.length > 0;
  return anyFail ? 'FAIL' : 'PASS';
}
