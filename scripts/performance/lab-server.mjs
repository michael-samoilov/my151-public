

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http2 from 'node:http2';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PRODUCTION = 'origin/claude/pokedex-region-builder-AviYF';

export function build(work, label, ref) {
  const out = path.join(work, `${label}-dist`);
  let cwd = root;
  if (ref) {
    cwd = path.join(work, `${label}-src`);
    execFileSync('git', ['worktree', 'add', '--detach', cwd, ref], { cwd: root, stdio: 'ignore' });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(cwd, 'node_modules'));
  }
  console.log(`Building ${label}${ref ? ` (${ref})` : ' (working tree)'}`);
  try {
    execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd, stdio: 'inherit' });
  } finally {
    if (ref) execFileSync('git', ['worktree', 'remove', '--force', cwd], { cwd: root, stdio: 'ignore' });
  }
  return out;
}

// platform: Chrome's `--ignore-certificate-errors-spki-list` trusts only the `spki` key hash and fully checks every other certificate.
export function selfSignedTls(work) {
  const keyFile = path.join(work, 'key.pem');
  const certFile = path.join(work, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  const publicKey = execFileSync('openssl', ['x509', '-in', certFile, '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: publicKey });
  const spki = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: der }).toString('base64');
  return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile), spki };
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

export function serve(dist, tls) {
  const brotli = new Map();
  const server = http2.createSecureServer({ ...tls, allowHTTP1: true }, (req, res) => {
    const url = new URL(req.url, 'https://lab');
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{}');
    }
    let file = path.join(dist, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    else if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
    const immutable = /^\/(assets|sprites)\//.test(url.pathname);
    const headers = { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' };
    let body = fs.readFileSync(file);
    if (/text|javascript|json|svg|xml/.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!brotli.has(file)) brotli.set(file, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
      body = brotli.get(file);
      headers['content-encoding'] = 'br';
    }
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, origin: `https://localhost:${server.address().port}` })));
}

export function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((bin) => fs.existsSync(bin));
}

// platform: macOS has no `flock`, so the shared browser lock applies only where the tool exists.
export function holdBrowserLock() {
  const lock = path.join(tmpdir(), 'my151-browser.lock');
  if (process.env.MY151_BROWSER_LOCK || spawnSync('flock', ['--version']).status !== 0) return;
  console.log(`Waiting for ${lock} if another browser run holds it.`);
  const run = spawnSync('flock', [lock, process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, MY151_BROWSER_LOCK: '1' },
  });
  process.exit(run.status ?? 1);
}

const MIN_MEDIAN_CHANGE = 0.05;

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

export function compare(base, cand) {
  const mid = median(base);
  const c = median(cand);
  const delta = mid ? (c - mid) / mid : c ? Infinity : 0;
  const separated = Math.min(...cand) > Math.max(...base) || Math.max(...cand) < Math.min(...base);
  const verdict = separated && Math.abs(delta) > MIN_MEDIAN_CHANGE ? (delta < 0 ? 'better' : 'worse') : 'same';
  return { base: mid, cand: c, delta, verdict };
}
