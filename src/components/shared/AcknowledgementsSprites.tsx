import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useT, useTn, type Locale } from '@/i18n';
import altFormSpecies from '@/i18n/alt-form-species.json';
import { pickerFullName, type PickerNameTables } from '@/favorites/pickerFullName';
import { ACKNOWLEDGEMENTS } from '@/data/acknowledgements';
import { withNode } from './withNode';
import { artistCredit, OWN_UPLOAD, type CreditedSprite, type SpriteRole } from '@/data/spriteCredits';

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

/** Each project entry's name, for an artist's "via". */
const PROJECT_NAMES = new Map(ACKNOWLEDGEMENTS.flatMap((group) => group.entries.map((entry) => [entry.id, entry.name] as const)));
const projectName = (id: string) => PROJECT_NAMES.get(id) ?? id;

/** The summary's bucket for base sprites, which no entry id can equal. */
const BASE = '\u0000base';

/** Up to this many sprites show as one list; more fold by generation. */
const FOLD_AFTER = 12;

/** A link to another entry in the panel, inside running text. */
export function EntryLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-sm font-semibold underline decoration-primary decoration-2 underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

/** The current locale's Pokémon names, once they load. */
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

/**
 * Sprites by name in the current locale, each with its notes. A long list
 * folds by generation, so a reader opens only the generation they look for.
 */
function SpriteList({ sprites, notes }: { sprites: readonly CreditedSprite[]; notes?: (sprite: CreditedSprite) => ReactNode[] }) {
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
      {items.map((sprite) => (
        <li key={sprite.mon.id}>
          {pickerFullName(sprite.mon, ready)}
          {/* One run of notes, each led by its dot: a line breaks before a
              dot, never after one. */}
          {notes && notes(sprite).length > 0 && (
            <span className="text-muted-foreground">
              {notes(sprite).map((note, i) => <Fragment key={i}>{' ·\u00a0'}{note}</Fragment>)}
            </span>
          )}
        </li>
      ))}
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

/**
 * An artist's "Used for": one line that counts their sprites and names the
 * projects they came through, then every sprite.
 */
export function ArtistSprites({ name, onOpenProject }: { name: string; onOpenProject: (id: string) => void }) {
  const t = useT();
  const tn = useTn();
  const locale = useLocale();
  const sprites = useMemo(() => artistCredit(name)?.sprites ?? [], [name]);

  // How the summary counts: a base sprite under another artist's work by
  // itself, since it came through that artist; every other sprite by the
  // project it came through, the most first.
  const buckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sprite of sprites) {
      const key = sprite.role === 'base' ? BASE : sprite.via;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => Number(a[0] === BASE) - Number(b[0] === BASE) || b[1] - a[1]);
  }, [sprites]);
  /** Most of the artist's sprites came this way, so only the others say how they came. */
  const mainVia = buckets.find(([key]) => key !== BASE)?.[0];

  const parts = buckets.map(([key, count]) => (
    <Fragment key={key}>
      {key === BASE
        ? tn('ack.spritesBase', count)
        : key === OWN_UPLOAD
          ? tn('ack.spritesOwn', count)
          : withNode(
            tn('ack.spritesVia', count, { source: '\u0000' }),
            <EntryLink onClick={() => onOpenProject(key)}>{projectName(key)}</EntryLink>,
          )}
    </Fragment>
  ));
  // The locale's own list words ("A, B and C"), around nodes rather than strings.
  const people = new Intl.ListFormat(locale, { type: 'conjunction' });
  const joined = people
    .formatToParts(parts.map((_, i) => String(i)))
    .map((part, i) => (part.type === 'element' ? parts[Number(part.value)] : <Fragment key={`l${i}`}>{part.value}</Fragment>));

  // Each name in one piece: "KingOfThe-X-Roads" never breaks at its hyphen.
  // A sheet's note on what the person did follows the name, as the sheet
  // writes it: "MyMarshlands (face reference)".
  const nameList = (list: readonly { name: string; note?: string }[]) => people.formatToParts(list.map((other) => other.name)).map((part, i) => {
    if (part.type !== 'element') return <Fragment key={i}>{part.value}</Fragment>;
    const note = list.find((other) => other.name === part.value)?.note;
    return (
      <Fragment key={i}>
        <span className="whitespace-nowrap">{part.value}</span>
        {note ? ` (${note})` : null}
      </Fragment>
    );
  });
  const notes = (sprite: CreditedSprite): ReactNode[] => {
    const coArtists = (role: SpriteRole) => sprite.with.filter((other) => other.role === role);
    const drew = coArtists('drew');
    const base = coArtists('base');
    const edited = coArtists('edited');
    return [
      sprite.note ?? null,
      // A base sprite names the artist who built on it.
      sprite.role === 'base'
        ? drew.length ? withNode(t('ack.baseFor', { name: '\u0000' }), nameList(drew)) : t('ack.role.base')
        : drew.length ? withNode(t('ack.with', { name: '\u0000' }), nameList(drew)) : null,
      sprite.role === 'edited' ? t('ack.role.edited') : null,
      base.length ? withNode(t('ack.baseBy', { name: '\u0000' }), nameList(base)) : null,
      edited.length ? withNode(t('ack.editedBy', { name: '\u0000' }), nameList(edited)) : null,
      sprite.role !== 'base' && sprite.via !== mainVia
        ? t('ack.via', { source: sprite.via === OWN_UPLOAD ? t('ack.ownUploads') : projectName(sprite.via) })
        : null,
    ].filter(Boolean);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="ack-sprites">
      <p className="text-sm leading-relaxed" data-testid="ack-sprites-summary">{joined}</p>
      <SpriteList sprites={sprites} notes={notes} />
    </div>
  );
}

/** A project's sprites that no source names an artist for. */
export function ProjectOnlySprites({ sprites }: { sprites: readonly CreditedSprite[] }) {
  return <SpriteList sprites={sprites} />;
}
