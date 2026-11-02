import { execFile } from 'node:child_process';
import { chromium } from 'playwright';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 64 * 1024 * 1024;

export function resolveAgentBrowser() {
  const engineDir = process.env.VERIFY_ENGINE_DIR || '/opt/verify-my151';
  const candidates = [
    process.env.RENDER_AUDIT_AGENT_BROWSER_BIN,
    path.join(engineDir, 'agent-browser', 'node_modules', '.bin', 'agent-browser'),
    path.join(process.cwd(), 'node_modules', '.bin', 'agent-browser'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (existsSync(c) && statSync(c).isFile()) return c; } catch {  }
  }
  return null;
}

function runCli(bin, env, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, ['--json', ...args], { env, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err && !stdout) { reject(new Error(`agent-browser ${args[0]}: ${err.message}${stderr ? ` — ${stderr.slice(0, 300)}` : ''}`)); return; }
      const line = stdout.trim().split('\n').filter((l) => l.trim().startsWith('{')).at(-1);
      if (!line) { reject(new Error(`agent-browser ${args[0]}: no JSON in output: ${stdout.slice(0, 300)}`)); return; }
      let parsed;
      try { parsed = JSON.parse(line); } catch { reject(new Error(`agent-browser ${args[0]}: bad JSON: ${line.slice(0, 300)}`)); return; }
      // platform: agent-browser exits 0 when a command fails, so judge each command by its JSON success field.
      if (!parsed.success) { reject(new Error(`agent-browser ${args[0]}: ${parsed.error ?? 'failed'}`)); return; }
      resolve(parsed.data ?? {});
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fontCss(fontFile, family) {
  const b64 = readFileSync(fontFile).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:100 900;}`;
}

function agentBrowserPage(bin, env, session) {
  const run = (args) => runCli(bin, env, ['--session', session, ...args]);
  return {
    driver: 'agent-browser',
    async setViewport(width, height) { await run(['set', 'viewport', String(width), String(height), '1']); },
    async goto(url) {
      await run(['errors', '--clear']).catch(() => {});
      await run(['open', url]);
    },
    async addFontFace(fontFile, family) {

      const css = fontCss(fontFile, family);
      await this.evalJson(`(function(){ const s=document.createElement('style'); s.textContent=${JSON.stringify(css)}; document.head.appendChild(s); return true; })()`);
    },
    async fontsReady(timeoutMs = 10_000) {
      // platform: agent-browser eval never awaits a promise, so poll the status that document.fonts.ready resolves on.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const done = await this.evalJson(`document.fonts.status === 'loaded'`);
        if (done === true) return;
        await sleep(100);
      }
    },
    async evalJson(expression) {
      const data = await run(['eval', `JSON.stringify(${expression})`]);
      return data.result === undefined ? undefined : JSON.parse(String(data.result));
    },
    async screenshotFull(file) { await run(['screenshot', file, '--full']); },
    async pageErrors() {
      const data = await run(['errors']).catch(() => ({}));
      return (data.errors ?? []).map((e) => String(e.text ?? '').split('\n')[0]).filter(Boolean);
    },
    async close() { await run(['close']).catch(() => {}); },
  };
}

function playwrightPage(browser) {
  let page = null;
  let errors = [];
  return {
    driver: 'playwright',
    async setViewport(width, height) {
      if (page) await page.close();
      errors = [];
      page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => errors.push(String(e)));
    },
    async goto(url) { await page.goto(url); },
    async addFontFace(fontFile, family) { await page.addStyleTag({ content: fontCss(fontFile, family) }); },
    async fontsReady() { await page.evaluate(() => document.fonts.ready); },
    async evalJson(expression) { return page.evaluate(`(${expression})`); },
    async screenshotFull(file) { await page.screenshot({ path: file, fullPage: true }); },
    async pageErrors() { return [...errors]; },
    async close() { if (page) await page.close(); await browser.close(); },
  };
}

export async function openAuditBrowser({ chromiumPath } = {}) {
  const forced = process.env.RENDER_AUDIT_DRIVER;
  const bin = forced === 'playwright' ? null : resolveAgentBrowser();
  if (forced === 'agent-browser' && !bin) throw new Error('RENDER_AUDIT_DRIVER=agent-browser but the CLI is not installed');
  if (bin) {
    // platform: agent-browser reads flags only when its daemon starts, so configure it through AGENT_BROWSER_* variables, never flags.
    const env = { ...process.env, AGENT_BROWSER_ARGS: '--no-sandbox' };
    if (chromiumPath) env.AGENT_BROWSER_EXECUTABLE_PATH = chromiumPath;
    const session = `render-audit-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await runCli(bin, env, ['--session', session, 'open', 'about:blank']);
      return agentBrowserPage(bin, env, session);
    } catch (e) {
      if (forced) throw e;
      console.warn(`render-audit: agent-browser failed (${e.message}); falling back to Playwright`);
    }
  }
  const browser = await chromium.launch({ executablePath: chromiumPath });
  return playwrightPage(browser);
}
