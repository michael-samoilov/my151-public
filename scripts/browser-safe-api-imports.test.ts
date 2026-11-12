import { describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => new Proxy({}, {
  get(_target, key) {
    if (typeof key === 'symbol' || key === 'then' || key === '__esModule' || key === 'default') return undefined;
    throw new Error(`node:crypto.${String(key)} read while the module loads`);
  },
}));

describe('server modules that the admin demo bundles into the browser', () => {
  it('load without calling a Node built-in, the way a browser bundle loads them', async () => {
    await expect(import('../api/_dashboard')).resolves.toBeDefined();
    await expect(import('../src/components/admin/__fixtures__/sampleResponse')).resolves.toBeDefined();
  });
});
