import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const CHARSET = /<meta charset="[^"]*"\s*\/?>/i;
const DATA_TYPES = new Set(['application/ld+json', 'application/json', 'importmap']);

function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*"([^"]*)"/i.exec(attrs)?.[1].toLowerCase();
    if (type && DATA_TYPES.has(type)) continue;
    out.push(body);
  }
  return out;
}

export function scriptPolicy(html: string): string {
  const hashes = [...new Set(inlineScripts(html).map((body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`))];
  return ["script-src 'self'", ...hashes, "'inline-speculation-rules'"].join(' ');
}

export function withScriptPolicy(html: string, file: string): string {
  const charset = CHARSET.exec(html);
  if (!charset) throw new Error(`${file} has no <meta charset> to place the script policy after.`);
  const at = charset.index + charset[0].length;
  if (/<script\b/i.test(html.slice(0, at))) throw new Error(`${file} runs a script before its <meta charset>, so the script policy cannot cover it.`);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${scriptPolicy(html)}" />`;
  return `${html.slice(0, at)}\n    ${meta}${html.slice(at)}`;
}

function htmlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

export function scriptCsp(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'script-csp',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (config.build.ssr) return;
        const outDir = path.resolve(config.root, config.build.outDir);
        for (const file of htmlFiles(outDir)) {
          const html = fs.readFileSync(file, 'utf8');
          if (!/<script\b/i.test(html)) continue;
          if (html.includes('http-equiv="Content-Security-Policy"')) throw new Error(`${file} already carries a script policy.`);
          fs.writeFileSync(file, withScriptPolicy(html, path.relative(outDir, file)));
        }
      },
    },
  };
}
