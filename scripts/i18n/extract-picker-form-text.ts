import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const destination = 'docs/i18n/sources/pokemon-formnames.json';
const directory = process.argv[2] ?? 'docs/i18n/poke-corpus/corpus';
const locales = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'de', 'es', 'it'];
const pinned = JSON.parse(readFileSync(destination, 'utf8')) as {
  source: { repo: string; commit: string; sha256: Record<string, Record<string, string>> };
};
const result = { source: pinned.source, forms: {} as Record<string, { species: string; names: Record<string, string> }> };

function lines(game: string, locale: string, file = 'common'): string[] | undefined {
  const path = join(directory, game, `${locale}_${file}.txt.gz`);
  if (!existsSync(path)) return;
  const bytes = readFileSync(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== pinned.source.sha256[game]?.[locale]) throw new Error(`${path}: source does not match the pinned archive`);
  return gunzipSync(bytes).toString('utf8').split(/\r?\n/);
}

for (const game of ['ScarletViolet', 'LegendsZA', 'OmegaRubyAlphaSapphire']) {
  const ids = lines(game, 'qid');
  if (!ids) throw new Error(`${game}: missing qid source`);
  const text = Object.fromEntries(locales.flatMap((locale) => {
    const values = lines(game, locale);
    return values ? [[locale, values]] : [];
  })) as Record<string, string[]>;
  if (!text.en) throw new Error(`${game}: missing English source`);
  const species = new Map(ids.flatMap((id, index) => id.includes('.monsname.MONSNAME_')
    ? [[id.split('_').at(-1)!, text.en[index]]] : []));
  ids.forEach((id, index) => {
    const english = text.en[index];
    const isForm = id.includes('.zkn_form.ZKN_FORM_') && english && english !== 'One form';
    const isCostume = game === 'OmegaRubyAlphaSapphire' && id.startsWith('oras.common.5.') && [
      'Pikachu Rock Star', 'Pikachu Belle', 'Pikachu Pop Star', 'Pikachu, Ph.D.', 'Pikachu Libre', 'Cosplay Pikachu',
    ].includes(english);
    const owner = isForm ? species.get(id.split('_').at(-2)!) : isCostume ? 'Pikachu' : undefined;
    if (!owner) return;
    result.forms[id] = {
      species: owner,
      names: Object.fromEntries(Object.entries(text).map(([locale, values]) => [locale, values[index]])),
    };
  });
}

const hgssLocales = { en: 'en', ja: 'ja-Hrkt', ko: 'ko', fr: 'fr', de: 'de', es: 'es', it: 'it' };
const hgssIds = lines('HeartGoldSoulSilver', 'qid', 'msg');
const spikyIndex = hgssIds?.indexOf('hgss.802.166') ?? -1;
if (spikyIndex < 0) throw new Error('Missing Spiky-eared Pichu source');
result.forms['hgss.802.166'] = {
  species: 'Pichu',
  names: Object.fromEntries(Object.entries(hgssLocales).map(([locale, sourceLocale]) => {
    const text = lines('HeartGoldSoulSilver', sourceLocale, 'msg')?.[spikyIndex];
    if (!text) throw new Error(`Missing Spiky-eared Pichu source for ${locale}`);
    return [locale, text];
  })),
};
writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${destination}: ${Object.keys(result.forms).length} sourced form rows`);
