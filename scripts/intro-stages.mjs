// Prints the intro-showcase stage section maps as JSON (loads the TS module
// through vite's SSR transform so path aliases + TS just work).
import { createServer } from 'vite';

const server = await createServer({
  root: new URL('..', import.meta.url).pathname,
  server: { middlewareMode: true },
  logLevel: 'error',
});
const mod = await server.ssrLoadModule('/src/lib/introShowcase.ts');
const stages = mod.computeShowcaseStages();
console.log(JSON.stringify(stages.map(s => ({ count: s.count, sections: s.sections }))));
await server.close();
