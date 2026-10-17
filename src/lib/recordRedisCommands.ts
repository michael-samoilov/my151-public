import { vi } from 'vitest';

type Reply = (cmd: string[]) => unknown;

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

export function recordRedisCommands(reply: Reply = plainReply): string[][] {
  const commands: string[][] = [];
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
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
