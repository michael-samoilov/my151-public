

import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './servers.ts';
import type { SurfaceResult, Verdict } from './contract.ts';
export { compareChecks, coverageGaps, rollup, surfaceVerdict } from './contract.ts';
export type { Status, Check, SurfaceResult } from './contract.ts';

export interface RunReport {
  mode: 'absolute' | 'diff';
  base?: string;
  startedAt: string;
  surfaces: SurfaceResult[];
  regressions: string[];
  missingCoverage: string[];
  verdict: Verdict;
  /** Diff mode: changed regions on the fixed screens (lib/visual.ts). Not part of the verdict. */
  visual?: import('./visual.ts').VisualReport;
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
