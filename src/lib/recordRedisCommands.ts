import { vi } from 'vitest';

type Reply = (cmd: string[]) => unknown;

/** The default answer: an empty member list, a missing field, or 1. */
const plainReply: Reply = (cmd) => {
  switch (cmd[0].toLowerCase()) {
    case 'smismember':
      return cmd.slice(2).map(() => 0);
    case 'hmget':
      return cmd.slice(2).map(() => null);
    case 'sadd':
      return cmd.length - 2;
    default:
      return 1;
  }
};

/** Stub fetch so the Upstash SDK talks to nothing, and record each command it
 *  sends. Upstash bills per command, pipelined or not, so this list is the bill.
 *  `reply` answers a command; the default suits writes. Call
 *  `vi.unstubAllGlobals()` when done. */
export function recordRedisCommands(reply: Reply = plainReply): string[][] {
  const commands: string[][] = [];
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    // The SDK auto-pipelines, so a body is one command or a batch of them.
    const body = JSON.parse(init.body) as string[] | string[][];
    if (!Array.isArray(body[0])) {
      commands.push(body as string[]);
      return new Response(JSON.stringify({ result: reply(body as string[]) }));
    }
    const batch = body as string[][];
    commands.push(...batch);
    return new Response(JSON.stringify(batch.map((cmd) => ({ result: reply(cmd) }))));
  });
  return commands;
}
