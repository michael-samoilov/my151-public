

import fs from 'node:fs';
import path from 'node:path';
import { openSession } from './lib/engines.ts';
import {
  runDexExportSuite,
  runFavoritesSuite,
  runFoilWorkshopSuite,
  runGymCardExportParitySuite,
  runLeagueChangeSuite,
  runLeagueColumnHoverSuite,
  runLeagueExportTeamSuite,
  runLeagueFunnelNudgeSuite,
  runLeagueGymExportFoilSuite,
  runLeagueHomeSlotMoveProof,
  runLeagueSuite,
  runNotFoundSuite,
  runStandardSuite,
} from './lib/flows.ts';
import { probeEngines } from './doctor.ts';
import { buildIn, startPreview, addWorktree, REPO_ROOT, type Preview, type Worktree } from './lib/servers.ts';
import { Evidence, compareChecks, coverageGaps, rollup, surfaceVerdict, type SurfaceResult, type RunReport, type Check } from './lib/evidence.ts';
import { parseArgs, SURFACES, type SurfaceDef } from './lib/options.ts';
import { runVisualDiff, type VisualReport } from './lib/visual.ts';

const AFTER_PORT = 4180;
const BASE_PORT = 4181;

async function driveSurface(def: SurfaceDef, base: string, ev: Evidence, tag: string, video: boolean): Promise<{ checks: Check[]; video: string | null }> {
  const videoFile = video ? path.join(ev.dir, `${def.surface}-${tag}.${def.engine === 'blink' ? 'webm' : 'mp4'}`) : undefined;
  const s = await openSession(def.engine, def.persona, videoFile);
  try {
    const ctx = {
      base,
      surface: `${def.surface}--${tag}`,
      shot: (label: string) => ev.shotPath(`${def.surface}-${tag}`, label),
    };
    const checks: Check[] = [];
    const suites: Array<[string, () => Promise<Check[]>]> = [
      ['standard', () => runStandardSuite(s, def.persona, ctx)],
      ['dex-export', () => runDexExportSuite(s, def.persona, ctx)],
      ['foil-workshop', () => runFoilWorkshopSuite(s, def.persona, ctx)],
      ['league', () => runLeagueSuite(s, def.persona, ctx)],
      ['league-export-foil', () => runLeagueGymExportFoilSuite(s, def.persona, ctx)],
      ['league-change', () => runLeagueChangeSuite(s, def.persona, ctx)],
      ['league-hover', () => runLeagueColumnHoverSuite(s, def.persona, ctx)],
      ['league-home', () => runLeagueHomeSlotMoveProof(s, def.persona, ctx)],
      ['gym-card-export', () => runGymCardExportParitySuite(s, def.persona, ctx)],
      ['league-export-team', () => runLeagueExportTeamSuite(s, def.persona, ctx)],
      ['league-funnel', () => runLeagueFunnelNudgeSuite(s, def.persona, ctx)],
      ['favorites', () => runFavoritesSuite(s, def.persona, ctx)],
      ['not-found', () => runNotFoundSuite(s, def.persona, ctx)],
    ];
    for (const [name, fn] of suites) {
      try {
        const result = await fn();
        if (result.length) checks.push(...result);
        else checks.push({ name: `${name}:coverage`, status: 'skip', detail: 'required suite returned no checks' });
      } catch (e) {
        checks.push({ name: `${name}:uncaught`, status: 'fail', detail: (e as Error).message });
      }
    }
    return { checks, video: videoFile ?? null };
  } finally { await s.close(); }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${args.mode}`;
  const ev = new Evidence(runId);
  console.log(`run ${runId}  mode=${args.mode}${args.base ? ` base=${args.base}` : ''}`);

  const health = await probeEngines();
  const upEngines = new Set(health.filter((h) => h.available).map((h) => h.engine));
  for (const h of health) console.log(`  engine ${h.engine.padEnd(7)} ${h.available ? 'UP' : 'DOWN'}  ${h.detail.slice(0, 80)}`);

  const wanted = SURFACES.filter((sd) => !args.surfaces || args.surfaces.includes(sd.surface));

  let afterPreview: Preview | null = null;
  let basePreview: Preview | null = null;
  let worktree: Worktree | null = null;
  const surfaces: SurfaceResult[] = [];
  const regressions: string[] = [];
  const diffCoverage: string[] = [];

  try {
    if (!args.noBuild) { console.log('building working tree...'); await buildIn(REPO_ROOT); }
    afterPreview = await startPreview(REPO_ROOT, AFTER_PORT);
    console.log(`after build served at ${afterPreview.url}`);

    if (args.mode === 'diff') {
      if (!args.base) throw new Error('diff mode needs --base <ref>');
      worktree = addWorktree(args.base);
      console.log(`base worktree at ${worktree.dir}; building...`);
      await buildIn(worktree.dir);
      basePreview = await startPreview(worktree.dir, BASE_PORT);
      console.log(`base build served at ${basePreview.url}`);
    }

    for (const def of args.visualOnly ? [] : wanted) {
      if (!upEngines.has(def.engine)) {
        surfaces.push({ surface: def.surface, engine: def.engine, persona: def.persona, available: false, checks: [], screenshots: [], error: 'engine unavailable in this sandbox' });
        console.log(`  ${def.surface.padEnd(18)} INCONCLUSIVE (engine down)`);
        continue;
      }
      try {
        const videos: string[] = [];
        const afterRun = await driveSurface(def, afterPreview.url, ev, 'after', args.video);
        if (afterRun.video && fs.existsSync(afterRun.video)) videos.push(path.basename(afterRun.video));
        let checks = afterRun.checks;
        if (args.mode === 'diff' && basePreview) {
          const beforeRun = await driveSurface(def, basePreview.url, ev, 'before', args.video);
          if (beforeRun.video && fs.existsSync(beforeRun.video)) videos.push(path.basename(beforeRun.video));
          const beforeMap = new Map(beforeRun.checks.map((c) => [c.name, c.status]));
          const delta = compareChecks(def.surface, beforeRun.checks, afterRun.checks);
          regressions.push(...delta.regressions);
          diffCoverage.push(...delta.missingCoverage);
          checks = afterRun.checks.map((c) => ({ ...c, detail: `${c.detail ?? ''}${beforeMap.get(c.name) ? ` (before=${beforeMap.get(c.name)})` : ''}` }));
        }
        const failed = checks.filter((c) => c.status === 'fail').length;
        const result: SurfaceResult = { surface: def.surface, engine: def.engine, persona: def.persona, available: true, checks, screenshots: [], videos };
        surfaces.push(result);
        ev.writeSurface(result);
        const status = surfaceVerdict(result);
        console.log(`  ${def.surface.padEnd(18)} ${status === 'skip' ? 'INCONCLUSIVE' : status === 'fail' ? `FAIL (${failed})` : 'PASS'}${videos.length ? `  video:${videos.join(',')}` : ''}`);
      } catch (e) {
        surfaces.push({ surface: def.surface, engine: def.engine, persona: def.persona, available: true, checks: [], screenshots: [], error: (e as Error).message });
        console.log(`  ${def.surface.padEnd(18)} ERROR ${(e as Error).message.slice(0, 80)}`);
      }
    }

    let visual: VisualReport | undefined;
    if (args.mode === 'diff' && basePreview && !args.noVisual) {
      console.log('visual diff: rendering fixed screens on both builds...');
      visual = await runVisualDiff(basePreview.url, afterPreview.url, ev.dir, args.screens);
      console.log(`visual: ${visual.changed} of ${visual.screens.length} screens changed, ${visual.regions} regions, ${visual.unstable} unstable, ${visual.errors} errors`);
      for (const sc of visual.screens) {
        if (sc.error) console.log(`  ${sc.screen}-${sc.viewport}  ERROR ${sc.error.slice(0, 100)}`);
        for (const r of sc.regions) console.log(`  ${`${sc.screen}-${sc.viewport}`.padEnd(26)} ${r.unstable ? 'unstable ' : ''}[${r.x},${r.y} ${r.w}x${r.h}] ${r.text}`);
      }
      console.log(`visual sheet: ${ev.dir}/visual.png`);
    }

    const missingCoverage = args.visualOnly ? [] : [...coverageGaps(surfaces), ...diffCoverage];
    if ((args.visualOnly || visual) && !visual?.screens.length) missingCoverage.push('visual:no screens compared');
    if (visual?.errors) missingCoverage.push(`visual:${visual.errors} screen(s) could not be compared`);
    const rolled = args.visualOnly ? 'PASS' : rollup(surfaces, regressions, diffCoverage);
    const verdict = rolled === 'PASS' && missingCoverage.length ? 'INCONCLUSIVE' : rolled;
    const report: RunReport = { mode: args.mode, base: args.base, startedAt: runId, surfaces, regressions, missingCoverage, verdict, visual };
    const file = ev.writeReport(report);
    console.log(`\nverdict: ${verdict}`);
    if (regressions.length) console.log(`regressions:\n  ${regressions.join('\n  ')}`);
    if (missingCoverage.length) console.log(`missing coverage:\n  ${missingCoverage.join('\n  ')}`);
    console.log(`evidence: ${ev.dir}`);
    console.log(`report: ${file}`);
    process.exitCode = verdict === 'PASS' ? 0 : 1;
  } finally {
    afterPreview?.stop();
    basePreview?.stop();
    worktree?.cleanup();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => { console.error(e); process.exit(1); },
);
