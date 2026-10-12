import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useT, type Locale } from '@/i18n';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { pickerFullName, type PickerNameTables } from '@/favorites/pickerFullName';
import { spritesBySource } from '@/data/spriteCredits';
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

/** Lists of this many names or fewer show in full, without generation groups. */
const FLAT_LIMIT = 24;

/** The small-caps heading the View settings pane uses for its sections. */
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/**
 * The Pokémon and forms whose sprite the app takes from one source, by name
 * in the current locale. A long list folds into one row per generation.
 */
export function AcknowledgementsSprites({ source }: { source: SpriteCreditId }) {
  const t = useT();
  const locale = useLocale();
  const groups = useMemo(() => spritesBySource(source), [source]);
  const total = groups.reduce((sum, group) => sum + group.mons.length, 0);
  const [names, setNames] = useState<{ locale: Locale; tables: PickerNameTables } | null>(null);

  useEffect(() => {
    let live = true;
    loadTables(locale).then((loaded) => live && setNames({ locale, tables: loaded }), () => {});
    return () => {
      live = false;
    };
  }, [locale]);

  const named = useMemo(() => names && groups.map((group) => ({
    generation: group.generation,
    mons: group.mons.map((mon) => ({ id: mon.id, name: pickerFullName(mon, names.tables) })),
  })), [groups, names]);

  if (!total) return null;
  return (
    <section className="flex flex-col gap-1" data-testid="ack-sprites">
      <h4 className={`${HEADING} flex justify-between`}>
        <span>{t('ack.spriteList')}</span> <span className="tabular-nums">{total}</span>
      </h4>
      {!named || names?.locale !== locale ? (
        <p className="text-sm text-muted-foreground">{t('ack.loading')}</p>
      ) : total <= FLAT_LIMIT ? (
        <NameList mons={named.flatMap((group) => group.mons)} />
      ) : (
        <div className="divide-y border-y">
          {named.map((group) => (
            <details key={group.generation} className="group">
              <summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
                <span className="flex-1">{t('browser.subgroupGeneration', { gen: group.generation })}</span>
                <span className="tabular-nums text-muted-foreground">{group.mons.length}</span>
              </summary>
              <div className="pb-3 ps-6">
                <NameList mons={group.mons} />
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function NameList({ mons }: { mons: readonly { id: number; name: string }[] }) {
  return (
    <ul className="list-disc ps-5 text-sm leading-relaxed marker:text-muted-foreground">
      {mons.map((mon) => <li key={mon.id}>{mon.name}</li>)}
    </ul>
  );
}
