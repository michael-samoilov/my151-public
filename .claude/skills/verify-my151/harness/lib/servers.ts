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

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} ${args.join(' ')} timed out`)); }, timeoutMs);
    p.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)); });
  });
}

export async function buildIn(dir: string): Promise<void> {
  await run('npm', ['run', 'build'], dir, 240000);
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { res.destroy(); resolve(); });
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
  const proc = spawn('npm', ['run', 'preview', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await waitForPort(port, 60000);
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => { if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); return; } catch { /* fall back */ } } proc.kill('SIGKILL'); },
  };
}

export interface Worktree { dir: string; cleanup: () => void; }

// Check a base ref into a throwaway worktree and share the repo's node_modules by
// symlink, so the base build needs no npm ci. Assumes deps match the working
// tree (true for a diff against a near base); the SKILL notes the caveat.
export function addWorktree(ref: string): Worktree {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-base-'));
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: REPO_ROOT, stdio: 'inherit' });
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), nm, 'dir');
  return {
    dir,
    cleanup: () => {
      try { fs.rmSync(nm, { force: true }); } catch { /* symlink */ }
      try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch { /* best effort */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

export { sleep };
