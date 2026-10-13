import { useEffect, useMemo, useState } from 'react';
import { useLocale, useT, type Locale } from '@/i18n';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { pickerFullName, type PickerNameTables } from '@/favorites/pickerFullName';
import { chosenSprites } from '@/data/spriteCredits';
import type { SpriteCreditId } from '@/data/acknowledgements';

interface SharedNames { species: string[]; forms: Record<string, string> }
interface PickerNames { species: Record<string, number>; forms: Record<string, string> }

// The same files the name loaders read, so each locale stays one chunk. The
// picker's form names are read here rather than installed: installing them
// would change the names other pages show.
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

/** The small-caps heading the View settings pane uses for its sections. */
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/**
 * The sprites my151 chose one by one from a source (see `spriteCredits.ts`),
 * by name in the current locale, each with the people its row credits.
 * A bulk source with no such row shows no list.
 */
export function AcknowledgementsSprites({ source }: { source: SpriteCreditId }) {
  const t = useT();
  const locale = useLocale();
  const chosen = useMemo(() => chosenSprites(source), [source]);
  const [names, setNames] = useState<{ locale: Locale; tables: PickerNameTables } | null>(null);

  useEffect(() => {
    if (!chosen.length) return;
    let live = true;
    loadTables(locale).then((loaded) => live && setNames({ locale, tables: loaded }), () => {});
    return () => {
      live = false;
    };
  }, [chosen.length, locale]);

  if (!chosen.length) return null;
  const ready = names?.locale === locale ? names.tables : null;
  return (
    <section className="flex flex-col gap-1.5" data-testid="ack-sprites">
      <h4 className={`${HEADING} flex justify-between px-1`}>
        <span>{t('ack.spriteList')}</span> <span className="tabular-nums">{chosen.length}</span>
      </h4>
      <div className="rounded-lg border bg-card p-3">
        {ready ? (
          <ul className="list-disc ps-5 text-sm leading-relaxed marker:text-muted-foreground">
            {chosen.map((sprite) => (
              <li key={sprite.mon.id}>
                {pickerFullName(sprite.mon, ready)}
                {sprite.by && <span className="text-muted-foreground"> {t('ack.by', { name: sprite.by })}</span>}
                {sprite.with && <span className="text-muted-foreground"> {t('ack.with', { name: sprite.with })}</span>}
                {sprite.base && <span className="text-muted-foreground"> {t('ack.baseBy', { name: sprite.base })}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('ack.loading')}</p>
        )}
      </div>
    </section>
  );
}
