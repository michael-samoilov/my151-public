import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useT, useTn, type Locale } from '@/i18n';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { pickerFullName, type PickerNameTables } from '@/favorites/pickerFullName';
import { artistCredit, type CreditedSprite } from '@/data/spriteCredits';

interface SharedNames { species: string[]; forms: Record<string, string> }
interface PickerNames { species: Record<string, number>; forms: Record<string, string> }

const SHARED_NAMES = import.meta.glob<SharedNames>('../../i18n/names/*.json', { import: 'default' });
const PICKER_NAMES = import.meta.glob<PickerNames>('../../i18n/picker-names/*.json', { import: 'default' });

const tables = new Map<Locale, Promise<PickerNameTables>>();

function loadTables(locale: Locale): Promise<PickerNameTables> {
  let pending = tables.get(locale);
  if (!pending) {
    pending = Promise.all([
      SHARED_NAMES[`../../i18n/names/${locale}.json`](),
      PICKER_NAMES[`../../i18n/picker-names/${locale}.json`](),
    ]).then(([shared, picker]) => ({
      locale,
      species: shared.species,
      speciesIds: { ...altFormSpecies, ...picker.species },
      descriptors: { ...shared.forms, ...picker.forms },
    }));
    pending.catch(() => tables.delete(locale));
    tables.set(locale, pending);
  }
  return pending;
}

const FOLD_AFTER = 12;

function useNameTables(): PickerNameTables | null {
  const locale = useLocale();
  const [names, setNames] = useState<{ locale: Locale; tables: PickerNameTables } | null>(null);
  useEffect(() => {
    let live = true;
    loadTables(locale).then((loaded) => live && setNames({ locale, tables: loaded }), () => {});
    return () => {
      live = false;
    };
  }, [locale]);
  return names?.locale === locale ? names.tables : null;
}

function SpriteList({ sprites }: { sprites: readonly CreditedSprite[] }) {
  const t = useT();
  const tn = useTn();
  const ready = useNameTables();
  const generations = useMemo(() => {
    const byGen = new Map<number, CreditedSprite[]>();
    for (const sprite of sprites) {
      const list = byGen.get(sprite.mon.generation) ?? [];
      byGen.set(sprite.mon.generation, list);
      list.push(sprite);
    }
    return [...byGen].sort((a, b) => a[0] - b[0]);
  }, [sprites]);

  if (!ready) return <p className="text-sm text-muted-foreground">{t('ack.loading')}</p>;
  const list = (items: readonly CreditedSprite[]) => (
    <ul className="list-disc ps-5 text-sm leading-relaxed marker:text-muted-foreground">
      {items.map((sprite) => <li key={sprite.mon.id}>{pickerFullName(sprite.mon, ready)}</li>)}
    </ul>
  );
  if (sprites.length <= FOLD_AFTER) return list(sprites);
  return (
    <div className="-mx-3 -mb-3 divide-y border-t">
      {generations.map(([gen, items]) => (
        <details key={gen} className="group" data-testid="ack-sprites-generation">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{t('ack.generation', { gen })}</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="tabular-nums">{tn('ack.sprites', items.length)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            </span>
          </summary>
          <div className="px-3 pb-3">{list(items)}</div>
        </details>
      ))}
    </div>
  );
}

/** Names a bundle artist's sprites that my151 changed: the artist drew their base. */
export function ChangedBase({ sprites }: { sprites: readonly CreditedSprite[] }) {
  const tn = useTn();
  const locale = useLocale();
  const ready = useNameTables();
  if (!ready || !sprites.length) return null;
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(sprites.map((sprite) => pickerFullName(sprite.mon, ready)));
  return (
    <p className="text-xs leading-relaxed text-muted-foreground" data-testid="ack-artist-changed">
      {tn('ack.changedBase', sprites.length, { names })}
    </p>
  );
}

export function ArtistSprites({ name, summary }: { name: string; summary?: string }) {
  const tn = useTn();
  const sprites = useMemo(() => artistCredit(name)?.sprites ?? [], [name]);
  return (
    <div className="flex flex-col gap-3" data-testid="ack-sprites">
      <p className="text-sm leading-relaxed" data-testid="ack-sprites-summary">{summary ?? tn('ack.spritesOwn', sprites.length)}</p>
      {sprites.length > 0 && sprites.every((sprite) => sprite.changed) && (
        <p className="text-sm leading-relaxed" data-testid="ack-sprites-changed">{tn('ack.spritesChanged', sprites.length)}</p>
      )}
      <SpriteList sprites={sprites} />
    </div>
  );
}
