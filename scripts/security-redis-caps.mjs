import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.env.SECURITY_SOURCE_ROOT ? resolve(process.env.SECURITY_SOURCE_ROOT) : root;
const runtime = process.env.SECURITY_REDIS_RUNTIME;
if (!runtime) throw new Error('Set SECURITY_REDIS_RUNTIME to a directory containing redis-server and redis-cli.');
const phase = process.env.SECURITY_EVIDENCE_PHASE;
const directory = resolve(root, phase === 'before' || phase === 'after' ? 'docs/evidence/security-review-2026-10-16' : '.audit/security-review');
mkdirSync(directory, { recursive: true });
const socket = resolve(root, `.audit/security-redis-${process.pid}.sock`);
mkdirSync(dirname(socket), { recursive: true });
const run = promisify(execFile);
const server = spawn(resolve(runtime, 'redis-server'), ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
const command = async (...args) => {
  const { stdout } = await run(resolve(runtime, 'redis-cli'), ['-s', socket, '--json', ...args.map(String)]);
  return JSON.parse(stdout);
};
const results = [];
let ready = false;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = await command('PING') === 'PONG'; } catch { /* The socket appears after startup. */ }
    if (ready) break;
    await new Promise(resolveWait => setTimeout(resolveWait, 25));
  }
  if (!ready) throw new Error('Isolated Redis failed to start.');

  const sdk = readFileSync(resolve(root, 'node_modules/@upstash/ratelimit/dist/index.mjs'), 'utf8');
  const rateLua = sdk.match(/var fixedWindowLimitScript = `([\s\S]*?)`;/)?.[1];
  if (!rateLua) throw new Error('Cannot find the installed SDK fixed-window script.');
  await command('SET', 'local:rate:one-left', '4');
  const counts = await Promise.all(Array.from({ length: 20 }, () => command('EVAL', rateLua, 2, 'local:rate:one-left', '', 5, 600000, 1)));
  const accepted = counts.filter(([used, limit]) => used <= limit).length;
  results.push({ name: 'Actual installed SDK Lua, 20 concurrent requests, one token left', request: { initialUsed: 4, cap: 5, parallel: 20 }, response: { accepted, refused: 20 - accepted }, passed: accepted === 1 });

  for (const tool of ['submit', 'league']) {
    const source = readFileSync(resolve(sourceRoot, `api/${tool}.ts`), 'utf8');
    const lua = source.match(/const CAS_LUA = `([\s\S]*?)`;/)?.[1];
    if (!lua) throw new Error(`Cannot extract ${tool} CAS script.`);
    const clients = `local:${tool}:clients`;
    const versions = `${clients}:ver`;
    await command('EVAL', "for i=1,49999 do redis.call('HSET',KEYS[1],'fixture-'..i,'{}') end return redis.call('HLEN',KEYS[1])", 1, clients);
    const replies = await Promise.all(Array.from({ length: 20 }, (_, index) => command('EVAL', lua, 2, clients, versions, `new-${index}`, 0, '{}', 50000)));
    const finalCount = await command('HLEN', clients);
    results.push({ name: `${tool} actual CAS Lua, 20 new CIDs, one slot left`, request: { initialClientCount: 49999, cap: 50000, parallel: 20, args: ['new-CID', 0, '{}', 50000] },
      response: { replies, finalCount }, passed: finalCount === 50000 && replies.filter(value => value === 1).length === 1 });

    await command('HSET', clients, 'existing-no-version', '{}');
    await command('HDEL', clients, 'fixture-1');
    const update = await command('EVAL', lua, 2, clients, versions, 'existing-no-version', 0, '{"updated":true}', 50000);
    results.push({ name: `${tool} existing unversioned record can update at capacity`, request: { cid: 'existing-no-version', expectedVersion: 0 }, response: { result: update }, passed: update === 1 });

    await command('HSET', versions, 'orphan-version', '5');
    const orphan = await command('EVAL', lua, 2, clients, versions, 'orphan-version', 5, '{}', 50000);
    results.push({ name: `${tool} orphan version does not admit a new CID at capacity`, request: { cid: 'orphan-version', expectedVersion: 5 }, response: { result: orphan }, passed: orphan === 2 });
  }
} finally {
  server.kill('SIGTERM');
  await new Promise(resolveExit => {
    if (server.exitCode !== null) resolveExit();
    else server.once('exit', resolveExit);
  });
  rmSync(socket, { force: true });
  const output = { environment: 'Isolated real Redis 7.2.5 over a Unix socket. TCP disabled. No persistence. Only synthetic fixture keys.', sourceRoot, results };
  writeFileSync(resolve(directory, `redis-caps-${phase === 'before' || phase === 'after' ? phase : 'latest'}.json`), JSON.stringify(output, null, 2) + '\n');
}
for (const result of results) process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${result.name} ${JSON.stringify(result.response)}\n`);
if (results.some(result => !result.passed)) process.exitCode = 1;
