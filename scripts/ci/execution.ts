import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { atomicJson } from './artifact';
import type { Selection } from './policy';

export type Outcome = 'running' | 'passed' | 'failed' | 'interrupted';
export interface Stage {
  name: string;
  outcome: Outcome;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  pid?: number;
  exitCode?: number | null;
  signal?: string | null;
}

export class RunJournal {
  readonly status: {
    pid: number; head: string; source: string; selection: Selection; startedAt: string;
    outcome: Outcome; stages: Stage[]; endedAt?: string; durationMs?: number; error?: string;
  };
  private readonly started = Date.now();
  readonly directory: string;
  private readonly root: string;
  private readonly signal: AbortSignal;

  constructor(directory: string, root: string, selection: Selection, source: string, signal: AbortSignal, head = '') {
    this.directory = directory;
    this.root = root;
    this.signal = signal;
    this.status = { pid: process.pid, head, source, selection, startedAt: new Date().toISOString(), outcome: 'running', stages: [] };
    this.save();
  }

  private save() { atomicJson(join(this.directory, 'status.json'), this.status); }

  async stage(name: string, command: string, args: string[], env = process.env, { notices = false } = {}): Promise<void> {
    if (this.signal.aborted) throw new Error('Run interrupted.');
    const started = Date.now();
    const stage: Stage = { name, outcome: 'running', startedAt: new Date().toISOString() };
    this.status.stages.push(stage);
    this.save();
    console.log(`CI ${name} started`);
    const output = openSync(join(this.directory, `${name}.log`), 'a');
    try {
      const child = spawn(command, args, { cwd: this.root, env, detached: true, stdio: ['ignore', output, output, ...(notices ? [1] : [])] });
      stage.pid = child.pid;
      this.save();
      let force: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (!child.pid) return;
        try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        force = setTimeout(() => {
          try { process.kill(-child.pid!, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
        }, 5000);
      };
      this.signal.addEventListener('abort', stop, { once: true });
      if (this.signal.aborted) stop();
      try {
        const result = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code, signal) => resolve({ code, signal }));
        });
        stage.exitCode = result.code;
        stage.signal = result.signal;
        if (this.signal.aborted) throw new Error(`Stage ${name} interrupted.`);
        if (result.code !== 0) throw new Error(`Stage ${name} failed with exit ${result.code} (${result.signal ?? 'no signal'}). See ${name}.log.`);
        stage.outcome = 'passed';
      } finally {
        this.signal.removeEventListener('abort', stop);
        clearTimeout(force);
      }
    } catch (error) {
      stage.outcome = this.signal.aborted ? 'interrupted' : 'failed';
      throw error;
    } finally {
      closeSync(output);
      stage.endedAt = new Date().toISOString();
      stage.durationMs = Date.now() - started;
      this.save();
      console.log(`CI ${name} ${stage.outcome} (${(stage.durationMs / 1000).toFixed(1)}s)`);
    }
  }

  finish(outcome: Exclude<Outcome, 'running'>, error?: string) {
    if (outcome === 'passed' && (this.signal.aborted || this.status.stages.some(stage => stage.outcome !== 'passed'))) throw new Error('An incomplete run cannot pass.');
    this.status.outcome = outcome;
    this.status.error = error;
    this.status.endedAt = new Date().toISOString();
    this.status.durationMs = Date.now() - this.started;
    this.save();
  }
}

// Runs independent lanes at the same time. A failure surfaces only after every lane stops,
// so no stage is still running when the run record closes.
export async function settleLanes(lanes: (() => Promise<void>)[]): Promise<void> {
  const results = await Promise.allSettled(lanes.map(lane => lane()));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
}
