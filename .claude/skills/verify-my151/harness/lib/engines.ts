// The three real browser engines behind one Session interface.
//   Blink  — agent-browser CLI by default, Playwright as the fallback (also
//            carries the personas). See blinkDriverChoice below.
//   WebKit — WebKitGTK MiniBrowser over raw W3C WebDriver (the real iOS engine).
//   Gecko  — Mozilla-tarball Firefox over Marionette (no geckodriver; its only
//            host is github, which this session gates).
// Sessions run one-at-a-time per engine. Every method drives a trusted path;
// no synthetic event doubling (handoff rule 7).
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { PERSONAS, type PersonaName } from './personas.ts';
import { startXvfb, startFfmpeg, stopFfmpeg, killProc } from './capture.ts';
import { openAgentBrowser, resolveAgentBrowser } from './agentBrowser.ts';

// Fixed Xvfb displays for the video lanes. WebKit and Gecko never run at the same
// time (surfaces drive serially), so a fixed display each is safe.
const WEBKIT_DISPLAY = 99;
const GECKO_DISPLAY = 98;

export type EngineName = 'blink' | 'webkit' | 'gecko';
export const W3C_ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

// Page-side error trap for the engines with no host-side error events (WebKit,
// Gecko). Injected after each navigate; best-effort, since it runs post-load and
// misses errors thrown before injection. Blink uses host-side events instead and
// is authoritative. `[P151] crash` is the ErrorBoundary's stable crash log.
const ERROR_TRAP = `
window.__verifyErrors = window.__verifyErrors || [];
if (!window.__verifyTrap) {
  window.__verifyTrap = true;
  addEventListener('error', (e) => window.__verifyErrors.push('error: ' + (e.message || e.error)));
  addEventListener('unhandledrejection', (e) => window.__verifyErrors.push('rejection: ' + e.reason));
  const orig = console.error;
  console.error = function () { try { window.__verifyErrors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); } catch (_) {} return orig.apply(console, arguments); };
}
return true;`;

function safeReaddir(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// WebKitGTK ships MiniBrowser under a directory whose ABI version moves with the
// distro (webkit2gtk-4.1 today, webkitgtk-6.0 next) inside a multiarch directory
// named for the CPU (x86_64-linux-gnu on this runner, aarch64-linux-gnu on an
// arm one). Pinning either turns a working install into a false DOWN, so scan
// and take the highest ABI present. The fallback is only there to keep the
// doctor's "missing at ..." message concrete when nothing is installed yet.
const WEBKIT_BROWSER_FALLBACK = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';

function resolveWebKitBrowser(): string {
  if (process.env.VERIFY_WEBKIT_BROWSER) return process.env.VERIFY_WEBKIT_BROWSER;
  const roots = ['/usr/libexec', '/usr/lib'];
  for (const arch of safeReaddir('/usr/lib')) {
    if (arch.includes('-linux-')) roots.push(path.join('/usr/lib', arch));
  }
  const found: string[] = [];
  for (const root of roots) {
    for (const name of safeReaddir(root)) {
      if (!name.startsWith('webkit')) continue;
      const bin = path.join(root, name, 'MiniBrowser');
      if (fs.existsSync(bin)) found.push(bin);
    }
  }
  found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return found.at(-1) ?? WEBKIT_BROWSER_FALLBACK;
}

export const ENGINE_PATHS = {
  webkitDriver: process.env.VERIFY_WEBKIT_DRIVER || 'WebKitWebDriver',
  webkitBrowser: resolveWebKitBrowser(),
  firefox: process.env.VERIFY_FIREFOX_BIN || '/opt/verify-my151/firefox/firefox',
  webkitPort: 4599,
  marionettePort: 2828,
};

// One session against one engine. `evalJson` runs a function body that returns a
// JSON-serializable value, uniform across all three drivers.
export interface Session {
  readonly engine: EngineName;
  readonly persona: PersonaName | null;
  navigate(url: string): Promise<void>;
  evalJson<T = unknown>(body: string): Promise<T>;
  click(selector: string): Promise<void>;
  hover(selector: string): Promise<void>;
  /** Press at one element's centre, drag to another's, release. */
  dragPointer(fromSelector: string, toSelector: string): Promise<void>;
  screenshot(file: string): Promise<void>;
  errors(): Promise<string[]>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Blink (Playwright) ----------

class BlinkSession implements Session {
  readonly engine = 'blink' as const;
  constructor(
    readonly persona: PersonaName | null,
    private browser: Browser,
    private ctx: BrowserContext,
    private page: Page,
    private collected: string[],
    private videoFile: string | undefined,
  ) {}
  async navigate(url: string) { await this.page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
  async evalJson<T>(body: string): Promise<T> {
    const out = await this.page.evaluate(`JSON.stringify((()=>{ ${body} })())`);
    return JSON.parse(out as string) as T;
  }
  async click(selector: string) {
    const matches = await this.page.locator(selector).all();
    const viewport = this.page.viewportSize();
    let firstVisible: (typeof matches)[number] | undefined;
    for (const match of matches) {
      if (!(await match.isVisible())) continue;
      firstVisible ??= match;
      const box = await match.boundingBox();
      if (box && viewport && box.x < viewport.width && box.y < viewport.height
        && box.x + box.width > 0 && box.y + box.height > 0) {
        await match.click({ timeout: 10000 });
        return;
      }
    }
    if (firstVisible) { await firstVisible.click({ timeout: 10000 }); return; }
    throw new Error(`click: no visible element for ${selector}`);
  }
  async hover(selector: string) { await this.page.locator(selector).hover({ timeout: 10000 }); }
  async dragPointer(fromSelector: string, toSelector: string) {
    const from = this.page.locator(fromSelector);
    const to = this.page.locator(toSelector);
    await from.scrollIntoViewIfNeeded();
    const fb = await from.boundingBox();
    const tb = await to.boundingBox();
    if (!fb || !tb) throw new Error(`dragPointer: missing box for ${fromSelector} or ${toSelector}`);
    const fx = fb.x + fb.width / 2;
    const fy = fb.y + fb.height / 2;
    const tx = tb.x + tb.width / 2;
    const ty = tb.y + tb.height / 2;
    await this.page.mouse.move(fx, fy);
    await this.page.mouse.down();
    await this.page.waitForTimeout(350);
    await this.page.mouse.move(tx, ty, { steps: 12 });
    await this.page.waitForTimeout(250);
    await this.page.mouse.up();
  }
  async screenshot(file: string) { await this.page.screenshot({ path: file }); }
  async errors() { return [...this.collected]; }
  async close() {
    const video = this.videoFile ? this.page.video() : null;
    await this.ctx.close().catch(() => {}); // finalizes the recording
    if (video && this.videoFile) await video.saveAs(this.videoFile).catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

// Playwright's browser CDN is blocked in this sandbox, so never rely on a
// bundled download. Prefer an explicit path, else the pre-installed browser under
// PLAYWRIGHT_BROWSERS_PATH, else let Playwright resolve its own.
const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  for (const bin of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (fs.existsSync(bin)) return bin;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    // The unversioned symlink beside the revision directories is the one name
    // that survives an image bump, so prefer it. Otherwise take the highest
    // revision. `chromium-<digits>` matches neither chromium_headless_shell-*
    // (a different binary) nor chromium-tip-of-tree-* (a different browser).
    const stable = path.join(root, 'chromium');
    if (fs.existsSync(stable) && fs.statSync(stable).isFile()) return stable;
    const revisions = fs
      .readdirSync(root)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const match of revisions) {
      for (const layout of CHROMIUM_LAYOUTS) {
        const bin = path.join(root, match[0], ...layout);
        if (fs.existsSync(bin)) return bin;
      }
    }
  } catch { /* fall through to Playwright default */ }
  return undefined;
}

export async function openBlinkPlaywright(persona: PersonaName | null, videoFile?: string): Promise<Session> {
  const launchOptions: Parameters<typeof chromium.launch>[0] = { headless: true, args: ['--no-sandbox'] };
  const chromePath = resolveChromium();
  if (chromePath) launchOptions.executablePath = chromePath;
  const browser = await chromium.launch(launchOptions);
  const p = persona ? PERSONAS[persona] : null;
  const viewport = p ? p.viewport : { width: 1280, height: 800 };
  const ctxOpts: Parameters<Browser['newContext']>[0] = p
    ? { userAgent: p.userAgent, viewport, isMobile: p.isMobile, hasTouch: p.hasTouch, deviceScaleFactor: p.deviceScaleFactor }
    : { viewport };
  if (videoFile) ctxOpts.recordVideo = { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'verify-vid-')), size: viewport };
  const ctx = await browser.newContext(ctxOpts);
  if (p) await ctx.addInitScript(p.initScript);
  const page = await ctx.newPage();
  const collected: string[] = [];
  page.on('pageerror', (e) => collected.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && m.text().includes('[P151] crash')) collected.push(`crash: ${m.text()}`); });
  return new BlinkSession(persona, browser, ctx, page, collected, videoFile);
}

// ---------- Blink driver choice ----------

export type BlinkDriver = 'agent-browser' | 'playwright';

// Playwright is the default Blink driver. agent-browser remains opt-in because
// its synthetic pointer drag does not drive dnd-kit reliably. Force
// either with VERIFY_BLINK_DRIVER. Nothing here can change WebKit or Gecko:
// agent-browser drives chrome and lightpanda only, so those two lanes stay on
// WebDriver and Marionette and remain the only proof of real iOS and Firefox
// rendering.
export function blinkDriverChoice(): { driver: BlinkDriver; detail: string } {
  const forced = process.env.VERIFY_BLINK_DRIVER;
  if (forced === 'playwright') return { driver: 'playwright', detail: 'forced by VERIFY_BLINK_DRIVER' };
  const bin = resolveAgentBrowser();
  if (forced === 'agent-browser') {
    if (!bin) throw new Error('VERIFY_BLINK_DRIVER=agent-browser but the CLI is not installed (run setup-engines.sh)');
    return { driver: 'agent-browser', detail: bin };
  }
  return { driver: 'playwright', detail: resolveChromium() ?? 'Playwright browser resolution' };
}

export async function openBlink(persona: PersonaName | null, videoFile?: string): Promise<Session> {
  const { driver } = blinkDriverChoice();
  if (driver === 'playwright') return openBlinkPlaywright(persona, videoFile);
  // Measured limit of the CLI: `record start` rebuilds the page context and
  // drops the user-agent override and the init scripts, while keeping the
  // viewport. A persona recorded that way reports plain HeadlessChrome, so the
  // run would claim a surface it never drove. There is no runtime command to
  // set the UA back, so this combination goes to Playwright even when the
  // driver is forced: silently wrong evidence is worse than a fallback.
  if (videoFile && persona) {
    console.warn(`blink: ${persona} with --video uses Playwright (agent-browser record drops the persona identity)`);
    return openBlinkPlaywright(persona, videoFile);
  }
  try {
    return await openAgentBrowser(persona, resolveChromium(), videoFile);
  } catch (e) {
    // A CLI that is installed but cannot start must not take the Blink floor
    // down with it, so fall back and say so. An explicit VERIFY_BLINK_DRIVER
    // never falls back: a forced driver that fails is a real failure.
    if (process.env.VERIFY_BLINK_DRIVER) throw e;
    console.warn(`blink: agent-browser failed (${(e as Error).message}); falling back to Playwright`);
    return openBlinkPlaywright(persona, videoFile);
  }
}

// ---------- WebKit (WebKitGTK, raw W3C WebDriver) ----------

// Every request carries a hard socket timeout; a driver that accepts the socket
// but stalls the response must reject, never hang (a bug that cost a probe run).
function w3c(method: string, port: number, urlPath: string, body?: unknown): Promise<{ status: number; value: unknown }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method, timeout: 30000, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => { try { const j = JSON.parse(buf); resolve({ status: res.statusCode || 0, value: (j as { value: unknown }).value }); } catch { reject(new Error(`bad JSON from ${urlPath}: ${buf.slice(0, 200)}`)); } });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`w3c timeout ${method} ${urlPath}`)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** A W3C call whose failure must stop the flow. WebKitWebDriver answers a
 *  refused click or action with an error status, not an exception, so an
 *  unchecked call let the next check fail for a reason it never saw. */
async function w3cOk(method: string, port: number, urlPath: string, body?: unknown): Promise<{ status: number; value: unknown }> {
  const r = await w3c(method, port, urlPath, body);
  if (r.status >= 400) {
    const v = r.value as { error?: string; message?: string } | null;
    throw new Error(`webkit ${method} ${urlPath.replace(/\/session\/[^/]+/, '')} (${r.status}): ${v?.error ?? ''} ${v?.message ?? ''}`.trim());
  }
  return r;
}

function killGroup(driver: ChildProcess) {
  if (driver.pid) { try { process.kill(-driver.pid, 'SIGKILL'); return; } catch { /* fall back */ } }
  driver.kill('SIGKILL');
}

// Startup recovery only: clear a stray driver or browser left by a crashed prior
// run. WebKit is single-session, so a leaked process blocks the port. Normal
// teardown kills the session's own process group by pid (killGroup), never by name.
async function clearStrayWebKit() {
  await new Promise((r) => { spawn('pkill', ['-9', '-x', 'WebKitWebDriver']).on('exit', r); });
  await new Promise((r) => { spawn('pkill', ['-9', '-x', 'MiniBrowser']).on('exit', r); });
}

class WebKitSession implements Session {
  readonly engine = 'webkit' as const;
  readonly persona = null;
  constructor(private driver: ChildProcess, private sid: string, private xvfb: ChildProcess | null, private ffmpeg: ChildProcess | null) {}
  private async injectTrap() { await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/execute/sync`, { script: ERROR_TRAP, args: [] }).catch(() => {}); }
  async navigate(url: string) { await w3cOk('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/url`, { url }); await this.injectTrap(); }
  async evalJson<T>(body: string): Promise<T> {
    const r = await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/execute/sync`, { script: `return JSON.stringify((function(){ ${body} })());`, args: [] });
    // A script that throws comes back as an error object, not a string. Name
    // it, so a failing check reads as its own message and not as a JSON
    // parse failure of "[object Object]".
    if (r.status >= 400 || typeof r.value !== 'string') {
      const v = r.value as { error?: string; message?: string } | null;
      throw new Error(`webkit script error (${r.status}): ${v?.error ?? ''} ${v?.message ?? String(r.value)}`.trim());
    }
    return JSON.parse(r.value) as T;
  }
  async click(selector: string) {
    const el = await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/element`, { using: 'css selector', value: selector });
    const id = (el.value as Record<string, string>)[W3C_ELEMENT];
    if (!id) throw new Error(`webkit: element not found: ${selector}`);
    await w3cOk('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/element/${id}/click`, {});
  }
  async hover(selector: string) {
    const el = await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/element`, { using: 'css selector', value: selector });
    const id = (el.value as Record<string, string>)[W3C_ELEMENT];
    if (!id) throw new Error(`webkit: element not found: ${selector}`);
    await w3cOk('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/actions`, {
      actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [W3C_ELEMENT]: id }, x: 0, y: 0 }] }],
    });
    await sleep(150);
  }
  async dragPointer(fromSelector: string, toSelector: string) {
    const from = await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/element`, { using: 'css selector', value: fromSelector });
    const fromId = (from.value as Record<string, string>)[W3C_ELEMENT];
    const fromRect = await this.evalJson<{ x: number; y: number }>(`const r=document.querySelector(${JSON.stringify(fromSelector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`);
    const toRect = await this.evalJson<{ x: number; y: number }>(`const r=document.querySelector(${JSON.stringify(toSelector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`);
    const moves = Array.from({ length: 12 }, (_, index) => ({
      type: 'pointerMove', origin: 'viewport',
      x: Math.round(fromRect.x + ((toRect.x - fromRect.x) * (index + 1)) / 12),
      y: Math.round(fromRect.y + ((toRect.y - fromRect.y) * (index + 1)) / 12), duration: 50,
    }));
    await w3cOk('POST', ENGINE_PATHS.webkitPort, `/session/${this.sid}/actions`, { actions: [{ type: 'pointer', id: 'drag', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: { [W3C_ELEMENT]: fromId }, x: 0, y: 0, duration: 100 },
      { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 350 }, ...moves,
      { type: 'pause', duration: 250 }, { type: 'pointerUp', button: 0 },
    ] }] });
    await w3c('DELETE', ENGINE_PATHS.webkitPort, `/session/${this.sid}/actions`).catch(() => {});
    await sleep(400);
  }
  async screenshot(file: string) {
    const r = await w3c('GET', ENGINE_PATHS.webkitPort, `/session/${this.sid}/screenshot`);
    fs.writeFileSync(file, Buffer.from(r.value as string, 'base64'));
  }
  async errors() { return this.evalJson<string[]>(`return window.__verifyErrors || [];`).catch(() => [] as string[]); }
  async close() {
    await stopFfmpeg(this.ffmpeg); // finalize the clip before the display goes away
    await w3c('DELETE', ENGINE_PATHS.webkitPort, `/session/${this.sid}`).catch(() => {});
    killGroup(this.driver);
    killProc(this.xvfb);
  }
}

// Video mode runs the driver under a fixed Xvfb display so ffmpeg can grab it; the
// default keeps the simpler xvfb-run path, which the proven suite relies on.
export async function openWebKit(videoFile?: string): Promise<Session> {
  await clearStrayWebKit();
  let xvfb: ChildProcess | null = null;
  let driver: ChildProcess;
  if (videoFile) {
    xvfb = await startXvfb(WEBKIT_DISPLAY);
    driver = spawn(ENGINE_PATHS.webkitDriver, [`--port=${ENGINE_PATHS.webkitPort}`], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, DISPLAY: `:${WEBKIT_DISPLAY}` } });
  } else {
    driver = spawn('xvfb-run', ['-a', ENGINE_PATHS.webkitDriver, `--port=${ENGINE_PATHS.webkitPort}`], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  }
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(250);
    try { const s = await w3c('GET', ENGINE_PATHS.webkitPort, '/status'); if (s.status === 200) ready = true; } catch { /* not up yet */ }
  }
  if (!ready) { killGroup(driver); killProc(xvfb); throw new Error('WebKitWebDriver never became ready'); }
  const caps = { capabilities: { alwaysMatch: { browserName: 'MiniBrowser', 'webkitgtk:browserOptions': { binary: ENGINE_PATHS.webkitBrowser, args: ['--automation'] } } } };
  const sess = await w3c('POST', ENGINE_PATHS.webkitPort, '/session', caps);
  const sid = (sess.value as { sessionId: string }).sessionId;
  if (!sid) { killGroup(driver); killProc(xvfb); throw new Error('webkit: session create failed'); }
  await w3c('POST', ENGINE_PATHS.webkitPort, `/session/${sid}/window/rect`, { x: 0, y: 0, width: 1280, height: 900 }).catch(() => {});
  let ffmpeg: ChildProcess | null = null;
  if (videoFile) {
    ffmpeg = startFfmpeg(WEBKIT_DISPLAY, videoFile);
  }
  return new WebKitSession(driver, sid, xvfb, ffmpeg);
}

// ---------- Gecko (Firefox over Marionette) ----------

// Marionette wire framing is "<byteLength>:<json>" over a localhost TCP socket.
class MarionetteConn {
  private buf = Buffer.alloc(0);
  private waiters: ((v: unknown[]) => void)[] = [];
  constructor(private sock: net.Socket) { sock.on('data', (d) => this.onData(d)); }
  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const colon = this.buf.indexOf(0x3a);
      if (colon < 0) return;
      const len = parseInt(this.buf.subarray(0, colon).toString('ascii'), 10);
      if (Number.isNaN(len) || this.buf.length < colon + 1 + len) return;
      const payload = this.buf.subarray(colon + 1, colon + 1 + len).toString('utf8');
      this.buf = this.buf.subarray(colon + 1 + len);
      this.waiters.shift()?.(JSON.parse(payload));
    }
  }
  next(): Promise<unknown[]> { return new Promise((res) => this.waiters.push(res)); }
  send(obj: unknown[]) { const json = JSON.stringify(obj); this.sock.write(Buffer.from(`${Buffer.byteLength(json)}:${json}`, 'utf8')); }
  end() { this.sock.destroy(); }
}

class GeckoSession implements Session {
  readonly engine = 'gecko' as const;
  readonly persona = null;
  constructor(private ff: ChildProcess, private conn: MarionetteConn, private profile: string, private msgId: number, private xvfb: ChildProcess | null, private ffmpeg: ChildProcess | null) {}
  private async cmd<T = Record<string, unknown>>(name: string, params: unknown): Promise<T> {
    this.conn.send([0, this.msgId++, name, params ?? {}]);
    const resp = await this.conn.next(); // [1, id, error, result]
    if (resp[2]) throw new Error(`${name}: ${JSON.stringify(resp[2])}`);
    return resp[3] as T;
  }
  private async injectTrap() { await this.cmd('WebDriver:ExecuteScript', { script: ERROR_TRAP, args: [] }).catch(() => {}); }
  async navigate(url: string) { await this.cmd('WebDriver:Navigate', { url }); await this.injectTrap(); }
  async evalJson<T>(body: string): Promise<T> {
    const r = await this.cmd<{ value: string }>('WebDriver:ExecuteScript', { script: `return JSON.stringify((function(){ ${body} })());`, args: [] });
    return JSON.parse(r.value) as T;
  }
  async errors() { return this.evalJson<string[]>(`return window.__verifyErrors || [];`).catch(() => [] as string[]); }
  async click(selector: string) {
    const found = await this.cmd<{ value: Record<string, string> }>('WebDriver:FindElement', { using: 'css selector', value: selector });
    const id = found.value[W3C_ELEMENT];
    if (!id) throw new Error(`gecko: element not found: ${selector}`);
    await this.cmd('WebDriver:ElementClick', { id });
  }
  async hover(selector: string) {
    const found = await this.cmd<{ value: Record<string, string> }>('WebDriver:FindElement', { using: 'css selector', value: selector });
    const id = found.value[W3C_ELEMENT];
    if (!id) throw new Error(`gecko: element not found: ${selector}`);
    await this.cmd('WebDriver:PerformActions', {
      actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', origin: { [W3C_ELEMENT]: id }, x: 0, y: 0 }] }],
    });
    await sleep(150);
  }
  async dragPointer(fromSelector: string, toSelector: string) {
    const from = await this.cmd<{ value: Record<string, string> }>('WebDriver:FindElement', { using: 'css selector', value: fromSelector });
    const fromRect = await this.evalJson<{ x: number; y: number }>(`const r=document.querySelector(${JSON.stringify(fromSelector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`);
    const toRect = await this.evalJson<{ x: number; y: number }>(`const r=document.querySelector(${JSON.stringify(toSelector)}).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};`);
    const moves = Array.from({ length: 12 }, (_, index) => ({
      type: 'pointerMove', origin: 'viewport',
      x: Math.round(fromRect.x + ((toRect.x - fromRect.x) * (index + 1)) / 12),
      y: Math.round(fromRect.y + ((toRect.y - fromRect.y) * (index + 1)) / 12), duration: 50,
    }));
    await this.cmd('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'drag', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', origin: { [W3C_ELEMENT]: from.value[W3C_ELEMENT] }, x: 0, y: 0, duration: 100 },
      { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 350 }, ...moves,
      { type: 'pause', duration: 250 }, { type: 'pointerUp', button: 0 },
    ] }] });
    await this.cmd('WebDriver:ReleaseActions', {}).catch(() => {});
    await sleep(400);
  }
  async screenshot(file: string) {
    const r = await this.cmd<{ value: string }>('WebDriver:TakeScreenshot', { full: true });
    fs.writeFileSync(file, Buffer.from(r.value, 'base64'));
  }
  async close() {
    await stopFfmpeg(this.ffmpeg);
    await this.cmd('WebDriver:DeleteSession', {}).catch(() => {});
    this.conn.end();
    this.ff.kill('SIGKILL');
    // SIGKILL is asynchronous. Marionette's port is fixed, so the next
    // session's Firefox races this one for it unless the exit is awaited
    // (diff mode opens gecko twice back to back).
    if (this.ff.exitCode === null && this.ff.signalCode === null) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000);
        this.ff.once('exit', () => { clearTimeout(t); resolve(); });
      });
    }
    killProc(this.xvfb);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// Video mode runs Firefox non-headless under a fixed Xvfb display so ffmpeg can
// grab it; the default stays -headless, which the proven suite relies on.
export async function openGecko(videoFile?: string): Promise<Session> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ff-'));
  let xvfb: ChildProcess | null = null;
  const args = ['-marionette', '-no-remote', '-profile', profile, 'about:blank'];
  const env = { ...process.env, MOZ_MARIONETTE: '1' };
  if (videoFile) {
    xvfb = await startXvfb(GECKO_DISPLAY);
    (env as Record<string, string>).DISPLAY = `:${GECKO_DISPLAY}`;
  } else {
    args.unshift('-headless');
  }
  const ff = spawn(ENGINE_PATHS.firefox, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
  const sock = await new Promise<net.Socket>((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const s = net.createConnection({ host: '127.0.0.1', port: ENGINE_PATHS.marionettePort }, () => resolve(s));
      s.on('error', (e) => { if (++tries > 60) reject(e); else setTimeout(attempt, 500); });
    };
    attempt();
  });
  const conn = new MarionetteConn(sock);
  // A connection that lands on a dying prior listener never sends the
  // handshake, so the setup round-trips carry a deadline: fail the surface,
  // never hang the run.
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('gecko: no Marionette handshake within 20s')), 20000);
  });
  deadline.catch(() => {}); // the raced loser must not become an unhandled rejection
  try {
    await Promise.race([conn.next(), deadline]); // server handshake frame
    conn.send([0, 1, 'WebDriver:NewSession', { capabilities: {} }]);
    const resp = await Promise.race([conn.next(), deadline]); // [1, id, error, result]
    if (resp[2]) throw new Error(`gecko NewSession: ${JSON.stringify(resp[2])}`);
    let msgId = 2;
    conn.send([0, msgId++, 'WebDriver:SetWindowRect', { x: 0, y: 0, width: 1280, height: 900 }]);
    await Promise.race([conn.next(), deadline]).catch(() => {});
    let ffmpeg: ChildProcess | null = null;
    if (videoFile) {
      ffmpeg = startFfmpeg(GECKO_DISPLAY, videoFile);
    }
    return new GeckoSession(ff, conn, profile, msgId, xvfb, ffmpeg);
  } catch (e) {
    ff.kill('SIGKILL');
    killProc(xvfb);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- dispatch ----------

export async function openSession(engine: EngineName, persona: PersonaName | null = null, videoFile?: string): Promise<Session> {
  if (engine === 'blink') return openBlink(persona, videoFile);
  if (engine === 'webkit') return openWebKit(videoFile);
  return openGecko(videoFile);
}
