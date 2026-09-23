// Build and serve the app for verification. Absolute mode serves the working
// tree. Diff mode also serves a base ref from a git worktree on its own port, so
// the two builds never share a tree or a port (separate-before-serializing).
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const windows = process.platform === 'win32';
const npmCommand = windows ? 'npm.cmd' : 'npm';

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: windows });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} ${args.join(' ')} timed out`)); }, timeoutMs);
    p.on('error', (error) => { clearTimeout(timer); reject(error); });
    p.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)); });
  });
}

export async function buildIn(dir: string): Promise<void> {
  await run(npmCommand, ['run', 'build'], dir, 240000);
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Vite preview often listens on ::1 only; polling 127.0.0.1 spuriously times out.
  const host = 'localhost';
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host, port, path: '/' }, (res) => { res.destroy(); resolve(); });
      req.on('error', () => { if (Date.now() > deadline) reject(new Error(`port ${port} never answered`)); else setTimeout(poll, 400); });
    };
    poll();
  });
}

export interface Preview { url: string; stop: () => void; }

// Serve an already-built dir with `vite preview` on an isolated port. Spawn
// detached so `npm` leads a process group that includes the `vite` child, and
// stop() kills the group by pid; killing `npm` alone leaves `vite` holding the
// port, which collides with the next preview on the same port.
export async function startPreview(dir: string, port: number): Promise<Preview> {
  const proc = spawn(npmCommand, ['run', 'preview', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: windows });
  await Promise.race([waitForPort(port, 60000), new Promise<never>((_, reject) => proc.once('error', reject))]);
  return {
    url: `http://localhost:${port}`,
    stop: () => {
      if (proc.pid && windows) {
        try { execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch { /* fall back */ }
      }
      if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); return; } catch { /* fall back */ } }
      proc.kill('SIGKILL');
    },
  };
}

export interface Worktree { dir: string; cleanup: () => void; }

// Check a base ref into a throwaway worktree. Unix can share installed deps by
// symlink. On Windows, a directory junction makes recursive worktree cleanup
// follow the link and delete the source deps, so install in the base instead.
export function addWorktree(ref: string): Worktree {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-base-'));
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: REPO_ROOT, stdio: 'inherit' });
  const nm = path.join(dir, 'node_modules');
  if (windows) {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --prefer-offline --no-audit --no-fund'], { cwd: dir, stdio: 'inherit' });
  } else if (!fs.existsSync(nm)) {
    fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), nm, 'dir');
  }
  return {
    dir,
    cleanup: () => {
      const resolved = path.resolve(dir);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('verify-base-')) {
        throw new Error(`Refusing to clean unexpected worktree path: ${resolved}`);
      }
      if (!windows) { try { fs.unlinkSync(nm); } catch { /* symlink */ } }
      try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch { /* best effort */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

export { sleep };
