import fs from 'node:fs';
import path from 'node:path';

// platform: A preinstalled browser image pins its own Chromium revision, which drifts from @playwright/test's, so this lookup never names a revision.
const CHROMIUM_LAYOUTS = [
  ['chrome-linux', 'chrome'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-win', 'chrome.exe'],
];

export function resolveChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  for (const bin of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    if (fs.existsSync(bin)) return bin;
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;
  try {
    const stable = path.join(root, 'chromium');
    if (fs.existsSync(stable) && fs.statSync(stable).isFile()) return stable;
    const revisions = fs
      .readdirSync(root)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter((m): m is RegExpExecArray => m !== null)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const match of revisions) {
      for (const layout of CHROMIUM_LAYOUTS) {
        const bin = path.join(root, match[0], ...layout);
        if (fs.existsSync(bin)) return bin;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}
