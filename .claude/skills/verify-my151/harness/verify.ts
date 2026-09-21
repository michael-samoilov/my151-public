// Cross-engine verification CLI.
//   absolute            invariants must hold on the working-tree build.
//   diff --base <ref>   build both, drive identical flows, name before/after regressions.
// Usage (from repo root):
//   npx tsx .claude/skills/verify-my151/harness/verify.ts [absolute|diff] [--base <ref>]
//     [--surfaces a,b] [--no-build]
import fs from 'node:fs';
import path from 'node:path';
import { openSession, type EngineName } from './lib/engines.ts';
import type { PersonaName } from './lib/personas.ts';
import { runFavoritesSuite, runLeagueChangeSuite, runLeagueColumnHoverSuite, runLeagueHomeSlotMoveProof, runLeagueSuite, runStandardSuite } from './lib/flows.ts';
import { probeEngines } from './doctor.ts';
import { buildIn, startPreview, addWorktree, REPO_ROOT, type Preview, type Worktree } from './lib/servers.ts';
import { Evidence, rollup, type SurfaceResult, type RunReport, type Check } from './lib/evidence.ts';

interface SurfaceDef { surface: string; engine: EngineName; persona: PersonaName | null; }
const SURFACES: SurfaceDef[] = [
  { surface: 'blink', engine: 'blink', persona: null },
  { surface: 'blink-ios-safari', engine: 'blink', persona: 'ios-safari' },
  { surface: 'blink-ios-chrome', engine: 'blink', persona: 'ios-chrome' },
  { surface: 'blink-android', engine: 'blink', persona: 'android-chrome' },
  { surface: 'webkit', engine: 'webkit', persona: null },
  { surface: 'gecko', engine: 'gecko', persona: null },
];

const AFTER_PORT = 4180;
const BASE_PORT = 4181;

function parseArgs(argv: string[]) {
  const mode = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'absolute') as 'absolute' | 'diff';
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    mode,
    base: get('--base'),
    surfaces: get('--surfaces')?.split(','),
    noBuild: argv.includes('--no-build'),
    video: argv.includes('--video'),
  };
}

async function driveSurface(def: SurfaceDef, base: string, ev: Evidence, tag: string, video: boolean): Promise<{ checks: Check[]; video: string | null }> {
  const videoFile = video ? path.join(ev.dir, `${def.surface}-${tag}.${def.engine === 'blink' ? 'webm' : 'mp4'}`) : undefined;
  const s = await openSession(def.engine, def.persona, videoFile);
  try {
    const ctx = {
      base,
      surface: `${def.surface}--${tag}`,
      shot: (label: string) => ev.shotPath(`${def.surface}-${tag}`, label),
    };
    const checks = await runStandardSuite(s, def.persona, ctx);
    checks.push(...(await runLeagueSuite(s, def.persona, ctx)));
    checks.push(...(await runLeagueChangeSuite(s, def.persona, ctx)));
    checks.push(...(await runLeagueColumnHoverSuite(s, def.persona, ctx)));
    checks.push(...(await runLeagueHomeSlotMoveProof(s, def.persona, ctx)));
    checks.push(...(await runFavoritesSuite(s, def.persona, ctx)));
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

    for (const def of wanted) {
      if (!upEngines.has(def.engine)) {
        surfaces.push({ surface: def.surface, engine: def.engine, persona: def.persona, available: false, checks: [], screenshots: [], error: 'engine unavailable in this sandbox' });
        console.log(`  ${def.surface.padEnd(18)} SKIP (engine down)`);
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
          const beforeFindings = new Map(beforeRun.checks.map((c) => [c.name, new Set(c.findings ?? [])]));
          for (const c of afterRun.checks) {
            if (c.status === 'fail' && beforeMap.get(c.name) === 'pass') regressions.push(`${def.surface}:${c.name}`);
            // A set-valued check regresses when it gains a member the base did not have,
            // whatever its status: the app is assumed correct as it stands, so only the delta counts.
            const fresh = (c.findings ?? []).filter((k) => !(beforeFindings.get(c.name)?.has(k)));
            if (fresh.length) regressions.push(`${def.surface}:${c.name}: ${fresh.length} new finding(s): ${fresh.slice(0, 3).join(' ; ')}`);
          }
          checks = afterRun.checks.map((c) => ({ ...c, detail: `${c.detail ?? ''}${beforeMap.get(c.name) ? ` (before=${beforeMap.get(c.name)})` : ''}` }));
        }
        const failed = checks.filter((c) => c.status === 'fail').length;
        const result: SurfaceResult = { surface: def.surface, engine: def.engine, persona: def.persona, available: true, checks, screenshots: [], videos };
        surfaces.push(result);
        ev.writeSurface(result);
        console.log(`  ${def.surface.padEnd(18)} ${failed === 0 ? 'PASS' : `FAIL (${failed})`}${videos.length ? `  video:${videos.join(',')}` : ''}`);
      } catch (e) {
        surfaces.push({ surface: def.surface, engine: def.engine, persona: def.persona, available: true, checks: [], screenshots: [], error: (e as Error).message });
        console.log(`  ${def.surface.padEnd(18)} ERROR ${(e as Error).message.slice(0, 80)}`);
      }
    }

    const verdict = rollup(surfaces, regressions);
    const report: RunReport = { mode: args.mode, base: args.base, startedAt: runId, surfaces, regressions, verdict };
    const file = ev.writeReport(report);
    console.log(`\nverdict: ${verdict}`);
    if (regressions.length) console.log(`regressions:\n  ${regressions.join('\n  ')}`);
    console.log(`evidence: ${ev.dir}`);
    console.log(`report: ${file}`);
    process.exitCode = verdict === 'PASS' ? 0 : 1;
  } finally {
    afterPreview?.stop();
    basePreview?.stop();
    worktree?.cleanup();
  }
}

// Engine drivers and preview children can leave handles open that keep the event
// loop alive after the report is written (a synchronous write, so exiting here is
// safe). Exit explicitly on the verdict code.
main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => { console.error(e); process.exit(1); },
);
