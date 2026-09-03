// Screen capture for the real-engine lanes. WebKit and Gecko have no built-in
// video, so run them under a known Xvfb display and grab it with ffmpeg. Blink
// uses Playwright's own recordVideo instead (see engines.ts). Sandbox video proves
// animation correctness and relative before/after behavior, not device smoothness
// (software-rendered, no vsync); that stays device-only.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Start a virtual X display and wait for its lock to appear.
export async function startXvfb(display: number, geometry = '1280x900x24'): Promise<ChildProcess> {
  const proc = spawn('Xvfb', [`:${display}`, '-screen', '0', geometry], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 50; i++) { if (fs.existsSync(`/tmp/.X${display}-lock`)) break; await sleep(100); }
  await sleep(300);
  return proc;
}

// Grab an X display to a file until stopped. SIGINT lets ffmpeg write the trailer,
// so the file is playable; SIGKILL would truncate it.
export function startFfmpeg(display: number, file: string, size = '1280x900'): ChildProcess {
  return spawn('ffmpeg', ['-loglevel', 'error', '-f', 'x11grab', '-video_size', size, '-framerate', '25', '-i', `:${display}`, '-pix_fmt', 'yuv420p', '-y', file], { stdio: 'ignore' });
}

export async function stopFfmpeg(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    proc.on('exit', done);
    try { proc.kill('SIGINT'); } catch { done(); }
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } done(); }, 5000);
  });
}

// Kill a detached process group by pid, falling back to the process.
export function killProc(proc: ChildProcess | null): void {
  if (!proc) return;
  try { if (proc.pid) { process.kill(-proc.pid, 'SIGKILL'); return; } } catch { /* fall back */ }
  try { proc.kill('SIGKILL'); } catch { /* gone */ }
}
