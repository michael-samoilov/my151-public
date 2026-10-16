

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function npmCommand(args: string[]): { cmd: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      cmd: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...args],
    };
  }
  return { cmd: 'npm', args };
}

const BUILD_EPOCH = process.env.SOURCE_DATE_EPOCH ?? String(Math.floor(Date.now() / 1000));

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, SOURCE_DATE_EPOCH: BUILD_EPOCH } });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} ${args.join(' ')} timed out`)); }, timeoutMs);
    p.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)); });
  });
}

export async function buildIn(dir: string): Promise<void> {
  const command = npmCommand(['run', 'build']);
  await run(command.cmd, command.args, dir, 240000);
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
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
  const command = npmCommand(['run', 'preview', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1']);
  const proc = spawn(command.cmd, command.args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await waitForPort(port, 60000);
  return {
    url: `http://localhost:${port}`,
    stop: () => {
      if (process.platform === 'win32' && proc.pid) {
        spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
        return;
      }
      if (proc.pid) { try { process.kill(-proc.pid, 'SIGKILL'); return; } catch {  } }
      proc.kill('SIGKILL');
    },
  };
}

export interface Worktree { dir: string; cleanup: () => void; }

export function addWorktree(ref: string): Worktree {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-base-'));
  execFileSync('git', ['worktree', 'add', '--detach', dir, ref], { cwd: REPO_ROOT, stdio: 'inherit' });
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) {
    fs.symlinkSync(
      path.join(REPO_ROOT, 'node_modules'),
      nm,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }
  return {
    dir,
    cleanup: () => {
      try {
        if (process.platform === 'win32') fs.unlinkSync(nm);
        else fs.rmSync(nm, { force: true });
      } catch {  }
      try { execFileSync('git', ['worktree', 'remove', '--force', dir], { cwd: REPO_ROOT, stdio: 'inherit' }); } catch {  }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {  }
    },
  };
}

export { sleep };
