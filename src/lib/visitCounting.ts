import { AUTOMATED } from './automation';
import { isOptedOut } from './clientId';
import { DEMO_MODE, PREVIEW_DEPLOY } from './demoMode';
import { currentPage, currentTool } from './tool';
import { whenIdle } from './whenIdle';

let insightsStarted = false;

function startVercelInsights(): void {
  if (insightsStarted || isOptedOut()) return;
  insightsStarted = true;
  whenIdle(() => {
    void import('@vercel/analytics').then((m) => m.inject({ beforeSend: (event) => (isOptedOut() ? null : event) }));
    void import('@vercel/speed-insights').then((m) => m.injectSpeedInsights({ beforeSend: (event) => (isOptedOut() ? null : event) }));
  });
}

function countVisit(): void {
  if (DEMO_MODE || PREVIEW_DEPLOY) return;
  const body = JSON.stringify({ tool: currentTool(), page: currentPage(), out: isOptedOut() || undefined, auto: AUTOMATED || undefined });
  whenIdle(() => {
    void fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  });
}

export function installVisitCounting(): void {
  countVisit();
  startVercelInsights();
  window.addEventListener('p151-opt-out', startVercelInsights);
}
