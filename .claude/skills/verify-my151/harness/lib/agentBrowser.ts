// The Blink lane, driven through Vercel's agent-browser CLI.
//
// This is the default Blink driver. Playwright stays in engines.ts as the
// fallback for a machine where the CLI is absent or cannot start, so a run
// never loses the Blink floor. WebKit and Gecko are untouched: agent-browser
// exposes chrome and lightpanda only, so it cannot reach either engine.
//
// Three CLI rules are load-bearing here, each one measured, not assumed:
//
//   1. Configure through the environment, never through flags. The CLI keeps a
//      background daemon, and --executable-path, --user-agent and --init-script
//      are read only when that daemon starts. A second invocation prints
//      "daemon already running" and drops the flag, which silently produced a
//      default-identity session. The AGENT_BROWSER_* variables are read per
//      session launch instead, so they always apply.
//   2. Give every Session its own random --session name. A name left behind by
//      a crashed run would otherwise be reused with that run's identity.
//   3. Judge every command by the JSON `success` field, never by the exit code.
//      A failed click exits 0 and reports {"success":false}.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PERSONAS, type PersonaName } from './personas.ts';
import type { Session } from './engines.ts';

const COMMAND_TIMEOUT_MS = 60_000;

// Where the CLI might live, most explicit first. setup-engines.sh installs it
// under VERIFY_ENGINE_DIR, beside Firefox, so it never touches package.json and
// the skill stays self-contained.
export function resolveAgentBrowser(): string | null {
  const engineDir = process.env.VERIFY_ENGINE_DIR || '/opt/verify-my151';
  const candidates = [
    process.env.VERIFY_AGENT_BROWSER_BIN,
    path.join(engineDir, 'agent-browser', 'node_modules', '.bin', 'agent-browser'),
    path.join(process.cwd(), 'node_modules', '.bin', 'agent-browser'),
  ].filter((c): c is string => typeof c === 'string' && c.length > 0);
  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch { /* keep looking */ }
  }
  return null;
}

interface CliResult { success: boolean; data: Record<string, unknown> | null; error: string | null }

function runCli(bin: string, env: NodeJS.ProcessEnv, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['--json', ...args], { env, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      // A killed process (timeout) has no parseable output, so surface it as is.
      if (err && !stdout) { reject(new Error(`agent-browser ${args[0]}: ${err.message}${stderr ? ` — ${stderr.slice(0, 300)}` : ''}`)); return; }
      // The CLI prints one JSON object; take the last line so a stray warning
      // above it (a daemon notice, for one) cannot break the parse.
      const line = stdout.trim().split('\n').filter((l) => l.trim().startsWith('{')).at(-1);
      if (!line) { reject(new Error(`agent-browser ${args[0]}: no JSON in output: ${stdout.slice(0, 300)}`)); return; }
      try { resolve(JSON.parse(line) as CliResult); } catch { reject(new Error(`agent-browser ${args[0]}: bad JSON: ${line.slice(0, 300)}`)); }
    });
  });
}

class AgentBrowserSession implements Session {
  readonly engine = 'blink' as const;
  constructor(
    readonly persona: PersonaName | null,
    private bin: string,
    private env: NodeJS.ProcessEnv,
    private sessionName: string,
    private initScriptFile: string | null,
    private videoFile: string | undefined,
  ) {}

  private async run(args: string[]): Promise<Record<string, unknown>> {
    const r = await runCli(this.bin, this.env, ['--session', this.sessionName, ...args]);
    if (!r.success) throw new Error(`agent-browser ${args[0]}: ${r.error ?? 'failed'}`);
    return r.data ?? {};
  }

  // Best-effort variant for teardown, where a dead session must not mask the
  // real result of the run.
  private async runQuiet(args: string[]): Promise<void> {
    await this.run(args).catch(() => {});
  }

  async navigate(url: string) { await this.run(['open', url]); }

  async evalJson<T>(body: string): Promise<T> {
    // `eval` takes an expression, while the Session contract passes a function
    // body that returns. Wrapping in JSON.stringify keeps one shape across all
    // three engines: the CLI hands back the string, and this parses it.
    const data = await this.run(['eval', `JSON.stringify((function(){ ${body} })())`]);
    return JSON.parse(String(data.result)) as T;
  }

  async click(selector: string) {
    await this.run(['scrollintoview', selector]);
    await this.run(['click', selector]);
  }

  async hover(selector: string) {
    await this.run(['scrollintoview', selector]);
    const r = await runCli(this.bin, this.env, ['--session', this.sessionName, 'hover', selector]).catch(() => null);
    if (r?.success) return;
    await this.evalJson(`const el=document.querySelector(${JSON.stringify(selector)});
      if(!el) return false;
      const rect=el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,pointerType:'mouse',pointerId:1}));
      return true;`);
  }

  async screenshot(file: string) { await this.run(['screenshot', file]); }

  async errors(): Promise<string[]> {
    const out: string[] = [];
    // Page errors and console errors are two separate commands here, where
    // Playwright had two event streams. Keep the same prefixes so evidence
    // reads identically whichever driver produced it. `[P151] crash` is the
    // ErrorBoundary's stable crash log.
    const pageErrors = await this.run(['errors']).catch(() => ({}) as Record<string, unknown>);
    for (const e of (pageErrors.errors as { text?: string }[] | undefined) ?? []) {
      if (e.text) out.push(`pageerror: ${e.text.split('\n')[0]}`);
    }
    const console_ = await this.run(['console']).catch(() => ({}) as Record<string, unknown>);
    for (const m of (console_.messages as { text?: string; type?: string }[] | undefined) ?? []) {
      if (m.type === 'error' && m.text?.includes('[P151] crash')) out.push(`crash: ${m.text}`);
    }
    return out;
  }

  async close() {
    if (this.videoFile) await this.runQuiet(['record', 'stop']); // finalizes the clip
    await this.runQuiet(['close']);
    // Remove the whole mkdtemp directory, not just the script inside it.
    if (this.initScriptFile) { try { fs.rmSync(path.dirname(this.initScriptFile), { recursive: true, force: true }); } catch { /* best effort */ } }
  }
}

export async function openAgentBrowser(
  persona: PersonaName | null,
  chromiumPath: string | undefined,
  videoFile?: string,
): Promise<Session> {
  const bin = resolveAgentBrowser();
  if (!bin) throw new Error('agent-browser not installed (run setup-engines.sh)');

  const p = persona ? PERSONAS[persona] : null;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (chromiumPath) env.AGENT_BROWSER_EXECUTABLE_PATH = chromiumPath;
  env.AGENT_BROWSER_ARGS = '--no-sandbox';

  let initScriptFile: string | null = null;
  if (p) {
    env.AGENT_BROWSER_USER_AGENT = p.userAgent;
    // Init scripts are passed as file paths, so the persona's stubs go to a
    // temp file that close() removes.
    initScriptFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ab-')), 'persona.js');
    fs.writeFileSync(initScriptFile, p.initScript, 'utf8');
    env.AGENT_BROWSER_INIT_SCRIPTS = initScriptFile;
  }

  // Rule 2: a name no earlier run can have left behind.
  const sessionName = `verify-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const session = new AgentBrowserSession(persona, bin, env, sessionName, initScriptFile, videoFile);

  const viewport = p ? p.viewport : { width: 1280, height: 800 };
  const scale = p ? p.deviceScaleFactor : 1;
  try {
    // about:blank first, so the init scripts and the UA are in place before the
    // app loads and the viewport is right before its first layout.
    await runCli(bin, env, ['--session', sessionName, 'open', 'about:blank']);
    await runCli(bin, env, ['--session', sessionName, 'set', 'viewport', String(viewport.width), String(viewport.height), String(scale)]);
    if (videoFile) await runCli(bin, env, ['--session', sessionName, 'record', 'start', videoFile]);
  } catch (e) {
    await session.close().catch(() => {});
    throw e;
  }
  return session;
}
