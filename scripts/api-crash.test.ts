import { describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
vi.mock('../api/_shared.js', () => ({ redis: {}, getNetworkKey: () => 'network', isReadOnlyDeployment: () => true, parseClientId: () => undefined }));
import handler from '../api/crash';
import { sanitizeContext } from '../api/feedback';

function call(body: unknown): Promise<number> {
  return new Promise((resolve) => {
    const res = { status: (code: number) => ({ json: () => resolve(code) }), setHeader: () => res } as unknown as VercelResponse;
    void handler({ method: 'POST', body, headers: {} } as unknown as VercelRequest, res);
  });
}

const error = { name: 'TypeError', message: 'x is undefined', stack: 'at f', componentStack: 'in App', where: 'view' };

describe('crash report API', () => {
  it('takes a report that carries an error, and keeps the boundary name', async () => {
    expect(await call({ context: { route: 'view', error } })).toBe(200);
    expect(sanitizeContext({ error }).error).toMatchObject({ where: 'view' });
  });
  it('turns away a report with no error, so the endpoint cannot carry anything else', async () => {
    expect(await call({ context: { route: 'view' } })).toBe(400);
    expect(await call({ context: { route: 'view', error: { name: 'Error', message: '', stack: '' } } })).toBe(400);
  });
  it('turns away a context over the size cap instead of storing part of it', async () => {
    const big = { ...error, stack: 'a'.repeat(1999), componentStack: 'b'.repeat(1999), message: 'c'.repeat(399) };
    expect(await call({ context: { route: 'view', ua: 'u'.repeat(199), error: big } })).toBe(400);
  });
});
