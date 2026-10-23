import { describe, expect, it } from 'vitest';
import { compareChecks, coverageGaps, rollup, type Check, type SurfaceResult } from '../.claude/skills/verify-my151/harness/lib/contract.ts';
import { parseArgs } from '../.claude/skills/verify-my151/harness/lib/options.ts';

function surface(checks: Check[], overrides: Partial<SurfaceResult> = {}): SurfaceResult {
  return { surface: 'blink', engine: 'blink', persona: null, available: true, checks, screenshots: [], ...overrides };
}
const boot: Check = { name: 'boot:react-mounted', status: 'pass' };

describe('required verification coverage', () => {
  it('does not discard a requested unavailable engine beside a passing engine', () => {
    const surfaces = [surface([boot]), surface([], { surface: 'webkit', engine: 'webkit', available: false })];
    expect(rollup(surfaces, [])).toBe('INCONCLUSIVE');
    expect(coverageGaps(surfaces)).toEqual(['webkit:engine unavailable']);
  });

  it.each<[string, SurfaceResult[]]>([
    ['no requested surfaces', []],
    ['an empty available surface', [surface([])]],
    ['an all-skipped surface', [surface([{ name: 'boot:react-mounted', status: 'skip' }])]],
    ['an all-capability-skipped surface', [surface([{ name: 'favorites:short-sheet', status: 'skip', skipReason: 'desktop-pane', detail: 'desktop pane observed' }])]],
  ])('rejects %s', (_name, surfaces) => {
    expect(rollup(surfaces, [])).toBe('INCONCLUSIVE');
  });

  it('does not let a passing boot hide a missing required hydration check', () => {
    const surfaces = [surface([boot, { name: 'favorites:hydrated-grid', status: 'skip', detail: 'page never hydrated' }])];
    expect(rollup(surfaces, [])).toBe('INCONCLUSIVE');
    expect(coverageGaps(surfaces)).toEqual(['blink:favorites:hydrated-grid:required check skipped (page never hydrated)']);
  });

  it.each([
    ['placement:real-add-grows-store', 'desktop-blink-only', 'webkit', null],
    ['league:drive-writes-store', 'desktop-blink-only', 'blink', 'ios-safari'],
    ['league-change:flick-moves-stage', 'synthetic-touch-unavailable', 'gecko', null],
    ['league-change:flick-washes-the-stage', 'synthetic-touch-unavailable', 'webkit', null],
    ['league-hover:desktop-column-wash', 'hover-pointer-unavailable', 'gecko', null],
    ['favorites:short-sheet', 'desktop-pane', 'blink', null],
    ['favorites:tall-selector-fits', 'desktop-pane', 'webkit', null],
  ] as const)('accepts the measured capability exception for %s', (name, skipReason, engine, persona) => {
    const surfaces = [surface([boot, { name, status: 'skip', skipReason, detail: 'measured capability unavailable' }], { engine, persona })];
    expect(rollup(surfaces, [])).toBe('PASS');
    expect(coverageGaps(surfaces)).toEqual([]);
  });

  it.each([
    [{ name: 'boot:react-mounted', status: 'skip', skipReason: 'desktop-pane', detail: 'desktop pane' }, {}],
    [{ name: 'placement:real-add-grows-store', status: 'skip', skipReason: 'desktop-blink-only', detail: 'not attempted' }, {}],
    [{ name: 'favorites:short-sheet', status: 'skip', skipReason: 'desktop-pane', detail: 'desktop pane' }, { persona: 'ios-safari' }],
    [{ name: 'league-hover:desktop-column-wash', status: 'skip', skipReason: 'hover-pointer-unavailable' }, {}],
  ] satisfies Array<[Check, Partial<SurfaceResult>]>)('rejects a misplaced or unexplained capability exception %#', (check, overrides) => {
    expect(rollup([surface([boot, check], overrides)], [])).toBe('INCONCLUSIVE');
  });

  it('keeps actual failures authoritative when another engine or check is missing', () => {
    expect(rollup([
      surface([{ name: 'store:round-trip', status: 'fail' }]),
      surface([], { surface: 'webkit', available: false }),
    ], [])).toBe('FAIL');
    expect(rollup([surface([boot], { error: 'driver disconnected' })], [])).toBe('FAIL');
    expect(rollup([], ['blink:store:round-trip'])).toBe('FAIL');
  });

  it('requires diff coverage gaps even when every remaining check passes', () => {
    expect(rollup([surface([boot])], [], ['blink:store:round-trip:previously passing check disappeared'])).toBe('INCONCLUSIVE');
    expect(rollup([surface([boot])], [])).toBe('PASS');
  });
});

describe('differential evidence', () => {
  it('reports both a disappeared pass and a pass changed to skip', () => {
    const before: Check[] = [boot, { name: 'store:round-trip', status: 'pass' }, { name: 'render:grid', status: 'pass' }];
    const after: Check[] = [boot, { name: 'render:grid', status: 'skip', detail: 'grid missing' }];
    expect(compareChecks('blink', before, after)).toEqual({
      regressions: [],
      missingCoverage: [
        'blink:store:round-trip:previously passing check disappeared',
        'blink:render:grid:previously passing check skipped',
      ],
    });
  });

  it('still identifies failure transitions and new render findings', () => {
    const before: Check[] = [boot, { name: 'render:grid', status: 'fail', findings: ['old clipping'] }];
    const after: Check[] = [{ ...boot, status: 'fail' }, { name: 'render:grid', status: 'fail', findings: ['old clipping', 'new clipping'] }];
    expect(compareChecks('blink', before, after)).toEqual({
      regressions: ['blink:boot:react-mounted', 'blink:render:grid: 1 new finding(s): new clipping'],
      missingCoverage: [],
    });
  });

  it('does not invent regressions when passing checks and old findings remain', () => {
    const checks: Check[] = [boot, { name: 'render:grid', status: 'fail', findings: ['existing clipping'] }];
    expect(compareChecks('blink', checks, checks)).toEqual({ regressions: [], missingCoverage: [] });
  });
});

describe('verifier CLI selection', () => {
  it.each([
    ['--surfaces', 'blnik'],
    ['--surfaces', 'blink,'],
    ['--surfaces', ','],
    ['--surfaces'],
    ['--surfaces', '--no-build'],
    ['diff'],
    ['absolut'],
    ['--unknown'],
    ['--visual-only'],
    ['diff', '--base', 'HEAD', '--visual-only', '--no-visual'],
  ])('rejects invalid selection %j before engine startup', (...argv) => {
    expect(() => parseArgs(argv)).toThrowError();
  });

  it('selects exact native-engine and persona identifiers', () => {
    expect(parseArgs(['diff', '--base', 'HEAD', '--surfaces', 'blink-ios-safari,webkit', '--screens', 'builder-progress', '--video'])).toEqual({
      mode: 'diff', base: 'HEAD', surfaces: ['blink-ios-safari', 'webkit'], screens: ['builder-progress'],
      noBuild: false, video: true, noVisual: false, visualOnly: false,
    });
  });
});
