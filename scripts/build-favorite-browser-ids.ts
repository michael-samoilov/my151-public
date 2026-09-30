import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { allPickerMons, pickerDexId } from '../src/favorites/model/catalog';

export function favoriteBrowserIdOverlay(): Record<string, number> {
  return Object.fromEntries(allPickerMons()
    .map((mon) => [mon.id, pickerDexId(mon)] as const)
    .filter(([pickerId, browserId]) => pickerId !== browserId)
    .sort(([a], [b]) => a - b));
}

const outputPath = resolve('src/components/browser/favoriteBrowserIds.json');

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = `${JSON.stringify(favoriteBrowserIdOverlay())}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== output) {
      throw new Error('Favorite browser IDs are stale. Run npm run favorites:browser-ids.');
    }
  } else {
    writeFileSync(outputPath, output);
  }
}
