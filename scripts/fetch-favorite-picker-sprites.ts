import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ALTERNATE_PICKER_FORMS } from '../src/favorites/model/alternateForms';

const DIRECTORY = resolve(process.cwd(), 'public/sprites/pokemon');
const SOURCE = 'https://raw.githubusercontent.com/PokeAPI/sprites/ba403973fdf9d0ac59175813861e6a1f8ed5020c/sprites/pokemon/versions/generation-v/black-white';
const pending = ALTERNATE_PICKER_FORMS.filter((form) => form.spritePath);

async function importSprite(form: (typeof pending)[number]): Promise<string> {
  const slug = form.spritePath!;
  if (!/^(?:female\/)?[a-z0-9-]+$/.test(slug) || !Number.isInteger(form.id)) {
    throw new Error(`Invalid sprite entry: ${form.id} ${slug}`);
  }
  const target = resolve(DIRECTORY, `${form.id}.png`);
  if (existsSync(target)) return `kept ${form.id}`;
  const response = await fetch(`${SOURCE}/${slug}.png`);
  if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) {
    throw new Error(`Sprite not found: ${slug} (${response.status})`);
  }
  const image = Buffer.from(await response.arrayBuffer());
  if (image.length < 100 || !image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    throw new Error(`Invalid PNG: ${slug}`);
  }
  await writeFile(target, image, { flag: 'wx' });
  return `added ${form.id} ${slug}`;
}

if (!existsSync(resolve(process.cwd(), 'src/favorites/model/alternateForms.ts'))) {
  throw new Error('Run this script from the repository root.');
}
for (let at = 0; at < pending.length; at += 8) {
  const results = await Promise.all(pending.slice(at, at + 8).map(importSprite));
  for (const result of results) console.log(result);
}
