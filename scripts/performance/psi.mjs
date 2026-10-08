#!/usr/bin/env node
/**
 * Google's own PageSpeed Insights run of a deployed site, phone and desktop.
 *
 *   node scripts/performance/psi.mjs                          # hub, 1 run each
 *   node scripts/performance/psi.mjs --page hub,dex --runs 3
 *   node scripts/performance/psi.mjs --url https://<public deployment>
 *
 * Google cannot load a Vercel preview, because previews need a Vercel login.
 * Use `lighthouse.mjs` to measure a change before it ships.
 *
 * It needs PAGESPEED_API_KEY in the environment: a key restricted to the
 * PageSpeed Insights API, the one Google key Michael approved (October 8).
 * Set it in the Claude Code or Codex environment settings. Never print, log,
 * or commit it. The key goes to Google in a request header that curl reads
 * from stdin, so it is not in the command line either.
 *
 * Each page loads with `?notme`, so the runs stay out of the analytics.
 * "Field" is Chrome's real-user data for the whole origin over 28 days. A site
 * with few visits can have none. Use `lighthouse.mjs` to compare a change
 * before it ships; use this script to read what PageSpeed Insights shows.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { median } from './lab-server.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const ORIGIN = flag('url', 'https://my151.app').replace(/\/$/, '');
const RUNS = Number(flag('runs', 1));
const PAGES = { hub: '/', dex: '/pokedex-builder', league: '/custom-gym-leader', favorites: '/favorite-pokemon-picker' };
const PAGE_NAMES = flag('page', 'hub').split(',');
const STRATEGIES = flag('profile', 'mobile,desktop').split(',');
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'];
const LAB = {
  FCP: 'first-contentful-paint',
  LCP: 'largest-contentful-paint',
  SI: 'speed-index',
  TBT: 'total-blocking-time',
  CLS: 'cumulative-layout-shift',
  TTFB: 'server-response-time',
};
const FIELD = {
  LCP: 'LARGEST_CONTENTFUL_PAINT_MS',
  INP: 'INTERACTION_TO_NEXT_PAINT',
  CLS: 'CUMULATIVE_LAYOUT_SHIFT_SCORE',
  FCP: 'FIRST_CONTENTFUL_PAINT_MS',
  TTFB: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE',
};

const key = process.env.PAGESPEED_API_KEY;
if (!key) {
  console.error('PAGESPEED_API_KEY is not set. Add it in the environment settings, not in the repository.');
  process.exit(2);
}

function runPsi(url, strategy) {
  const query = new URLSearchParams({ url, strategy });
  for (const c of CATEGORIES) query.append('category', c.toUpperCase().replaceAll('-', '_'));
  const config = [
    `url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}"`,
    `header = "X-Goog-Api-Key: ${key}"`,
    'silent',
    'show-error',
    'max-time = 180',
  ].join('\n');
  const body = execFileSync('curl', ['--config', '-'], { input: config, maxBuffer: 64 * 1024 * 1024 }).toString();
  const json = JSON.parse(body);
  if (json.error) throw new Error(`PageSpeed Insights: ${json.error.code} ${json.error.message}`);
  return json;
}

const show = (name, v) => (name === 'CLS' ? v.toFixed(3) : `${Math.round(v)}`);

const saveDir = fs.mkdtempSync(path.join(tmpdir(), 'my151-psi-'));

for (const pageName of PAGE_NAMES) {
  const url = `${ORIGIN}${PAGES[pageName]}?notme`;
  for (const strategy of STRATEGIES) {
    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      process.stdout.write(`\r${strategy} ${pageName}: run ${i} of ${RUNS}   `);
      // PageSpeed Insights answers a repeat of a recent request from its cache,
      // with the same fetchTime. A cached copy is not a new run, so wait for a
      // fresh one.
      let json = runPsi(url, strategy);
      for (let wait = 1; runs.some((r) => r.lighthouseResult.fetchTime === json.lighthouseResult.fetchTime); wait++) {
        if (wait > 6) throw new Error(`PageSpeed Insights kept returning a cached run for ${strategy} ${pageName}`);
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        json = runPsi(url, strategy);
      }
      runs.push(json);
      fs.writeFileSync(path.join(saveDir, `${strategy}-${pageName}-${i}.json`), JSON.stringify(json));
    }
    process.stdout.write('\n');
    const lhrs = runs.map((r) => r.lighthouseResult);
    const scores = CATEGORIES.map((c) => `${c} ${median(lhrs.map((l) => Math.round((l.categories[c]?.score ?? 0) * 100)))}`);
    const lab = Object.entries(LAB).map(([name, id]) => `${name} ${show(name, median(lhrs.map((l) => l.audits[id]?.numericValue ?? 0)))}`);
    console.log(`\n${strategy} ${pageName} (${url}, Lighthouse ${lhrs[0].lighthouseVersion}, median of ${RUNS})`);
    console.log(`  Scores: ${scores.join(', ')}`);
    console.log(`  Lab (ms): ${lab.join(', ')}`);
    const field = runs[0].originLoadingExperience?.metrics;
    console.log(field
      ? `  Field, origin, p75: ${Object.entries(FIELD).filter(([, k]) => field[k]).map(([n, k]) => `${n} ${n === 'CLS' ? (field[k].percentile / 100).toFixed(2) : field[k].percentile} (${field[k].category})`).join(', ')}`
      : '  Field: no Chrome real-user data for this origin yet.');
    // The findings of the run with the median performance score.
    const byScore = [...lhrs].sort((a, b) => a.categories.performance.score - b.categories.performance.score);
    const lhr = byScore[Math.floor((byScore.length - 1) / 2)];
    const findings = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 0.9 && ['binary', 'numeric', 'metricSavings'].includes(a.scoreDisplayMode) && !Object.values(LAB).includes(a.id))
      .sort((a, b) => Math.max(0, ...Object.values(b.metricSavings ?? {})) - Math.max(0, ...Object.values(a.metricSavings ?? {})));
    console.log('  Findings:');
    for (const a of findings) {
      const savings = Object.entries(a.metricSavings ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${k === 'CLS' ? v.toFixed(3) : `${Math.round(v)} ms`}`).join(', ');
      console.log(`  - ${a.title}${a.displayValue ? ` — ${a.displayValue}` : ''}${savings ? ` (saves ${savings})` : ''}  \`${a.id}\``);
    }
  }
}
console.log(`\nRaw reports: ${saveDir}`);
