import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useLocale, useT, useTn, type NoArgKey } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import {
  ACKNOWLEDGEMENTS,
  artistEntryId,
  type Acknowledgement,
  type AcknowledgementGroupId,
  type LicenseFile,
} from '@/data/acknowledgements';
import type { NpmPackage, NpmPackageIndex } from '@/data/npmPackages';
import { artistTerms, sourceTerms, type TermsQuote } from '@/data/creditTerms';
import { artistCredit, projectArtists, projectOnlySprites, projectSpriteCount } from '@/data/spriteCredits';
import { ArtistSprites, EntryLink, ProjectOnlySprites } from './AcknowledgementsSprites';
import { withNode } from './withNode';

const GROUP_KEYS = {
  'sprite-projects': 'ack.group.spriteProjects',
  'sprite-artists': 'ack.group.spriteArtists',
  'pokemon-art': 'ack.group.pokemonArt',
  'interface-icons': 'ack.group.interfaceIcons',
  fonts: 'ack.group.fonts',
  data: 'ack.group.data',
  code: 'ack.group.code',
} as const satisfies Record<AcknowledgementGroupId, NoArgKey>;

const GROUPS = ACKNOWLEDGEMENTS.filter((group) => group.entries.length > 0);

const ENTRIES = new Map(GROUPS.flatMap((group) => group.entries.map((entry) => [entry.id, entry] as const)));

/** One request per file per page load, shared by every open of the panel. */
const licenseTexts = new Map<string, Promise<string>>();

function loadLicense(file: string): Promise<string> {
  let text = licenseTexts.get(file);
  if (!text) {
    text = fetch(`/licenses/${file}`).then((response) => {
      if (!response.ok) throw new Error(`${response.status} for ${file}`);
      return response.text();
    });
    // A failed load is asked for again on the next open, not remembered.
    text.catch(() => licenseTexts.delete(file));
    licenseTexts.set(file, text);
  }
  return text;
}

const host = (href: string) => new URL(href, window.location.href).hostname.replace(/^www\./, '');

const indent = (line: string) => line.length - line.trimStart().length;
const isRule = (line: string) => /^\s*[=\-_*]{3,}\s*$/.test(line);
/** Short enough to fit the license box on a 320 px phone. */
const RULE_COLUMNS = 32;
/** A Markdown heading, or a short capitals line with no closing punctuation ("PREAMBLE"). */
const isHeading = (line: string) => {
  const text = line.trim();
  return text.startsWith('#')
    || (/[A-Z]/.test(text) && !/[a-z]/.test(text) && text.length <= 40 && !/[.,;:]$/.test(text));
};
const LIST_MARKER = /^([*\-•+]|\d+(\.\d+)*[.)]|\(?[a-z0-9]{1,3}\))\s+/i;
const isListItem = (line: string) => LIST_MARKER.test(line.trimStart());

/**
 * Whether `line` continues the paragraph `prev` ends. Three layouts do: the
 * same indent, a first line indented deeper than the rest ("  The GNU General
 * Public License is"), and a list item's hanging indent ("(a) that the" over
 * "    in Exhibit B").
 */
function continues(prev: string, line: string, beforePrev: string | undefined): boolean {
  if (!prev.trim() || !line.trim()) return false;
  if (isRule(line) || isRule(prev) || isHeading(line) || isHeading(prev)) return false;
  // A marker starts an item after a finished clause. Mid-sentence it is a
  // wrapped number: GPL's "section" over "7.  This requirement".
  if (isListItem(line) && /[.:;!?)"'”]$/.test(prev.trim())) return false;
  const [from, to] = [indent(prev), indent(line)];
  if (to === from) return true;
  if (to < from) return !beforePrev?.trim() && !isListItem(prev);
  const marker = LIST_MARKER.exec(prev.trimStart());
  return marker !== null && to === from + marker[0].length;
}

/**
 * Joins the hard-wrapped lines of a license file into paragraphs.
 *
 * The files wrap at about 76 columns. A phone shows about 40 monospace
 * columns, so each source line broke again on its own and every second line
 * held one or two words. Blank lines, list items, headings and rules keep
 * their breaks, so the license's structure survives. A centred line (an
 * indent of 12 or more, like GPL's title) loses its indent, which would
 * otherwise wrap it on a phone. A rule line shrinks to RULE_COLUMNS, so its
 * dashes do not break onto a second line.
 */
function reflow(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '').split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && continues(lines[i - 1], line, lines[i - 2])) out[out.length - 1] += ` ${line.trim()}`;
    else if (isRule(line)) out.push(line.trim().slice(0, RULE_COLUMNS));
    else out.push(indent(line) >= 12 ? line.trim() : line.trimEnd());
  });
  return out.join('\n');
}

/** The small-caps heading the View settings pane uses for its sections. */
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

/** A detail section: its heading above a white card, as the list groups are. */
function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className={cn(HEADING, 'flex justify-between gap-2 px-1')}>
        <span>{label}</span>
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </h4>
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">{children}</div>
    </section>
  );
}

/**
 * A link that leaves the panel: a red icon and a bold label, so a credit's
 * links stand out from its text (Michael, 2026-10-13).
 */
function ExternalLinks({ links }: { links: readonly { href: string; label: string }[] }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(({ href, label }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 break-words">{label}</span>
        </a>
      ))}
    </div>
  );
}

/** One row of a list of entries: the panel's list and a project's artists. */
function EntryRow({ entry, note, onOpen }: { entry: Acknowledgement; note: string; onOpen: (id: string) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      data-ack-id={entry.id}
      onClick={() => onOpen(entry.id)}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Two boxes, each with its own ellipsis: the credit gives way
            first, and the name only past the row. */}
        <span className="flex min-w-0 items-baseline gap-1 text-sm">
          <span className="max-w-full shrink-0 truncate font-medium">{entry.name}</span>
          {entry.by && <span className="min-w-0 truncate text-muted-foreground">{t('ack.by', { name: entry.by })}</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/**
 * The second line of an entry's row: an artist's sprite count, the npm
 * packages' count and licenses once their list loads, otherwise the license.
 */
function useRowNote() {
  const t = useT();
  const tn = useTn();
  const index = usePackageIndex();
  return (entry: Acknowledgement) => {
    if (entry.kind === 'artist') return tn('ack.sprites', artistCredit(entry.name)?.sprites.length ?? 0);
    if (entry.kind === 'project' && !entry.license && projectSpriteCount(entry.id) > 0) return tn('ack.sprites', projectSpriteCount(entry.id));
    if (entry.kind === 'packages') {
      if (!index.index) return index.failed ? t('ack.packagesFailed') : t('ack.loading');
      return `${tn('ack.packageCount', index.index.packages.length)} · ${tn('ack.licenseCount', byLicense(index.index).length)}`;
    }
    return entry.license ?? t('ack.credit');
  };
}

function LicenseText({ file, titled }: { file: LicenseFile; titled: boolean }) {
  const t = useT();
  const [state, setState] = useState<{ text?: string; failed?: boolean }>({});
  useEffect(() => {
    let live = true;
    loadLicense(file.file).then(
      (text) => live && setState({ text }),
      () => live && setState({ failed: true }),
    );
    return () => {
      live = false;
    };
  }, [file.file]);

  return (
    <div className="flex flex-col gap-1">
      {titled && <p className="text-sm font-medium">{file.name}</p>}
      {state.text !== undefined ? (
        <pre
          data-testid="ack-license-text"
          className="whitespace-pre-wrap break-words border-t pt-3 font-mono text-xs leading-relaxed text-foreground/90"
        >
          {reflow(state.text)}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground" role={state.failed ? 'alert' : undefined}>
          {state.failed ? t('ack.loadFailed') : t('ack.loading')}
        </p>
      )}
    </div>
  );
}

/** A project's artists: a row for each one with sprites in the app, then the rest by name. */
function ProjectArtists({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const t = useT();
  const tn = useTn();
  const { credited, others } = projectArtists(id);
  if (!credited.length && !others.length) return null;
  return (
    <>
      {credited.length > 0 && (
        <section className="flex flex-col gap-1.5" data-testid="ack-project-artists">
          <h4 className={cn(HEADING, 'flex justify-between gap-2 px-1')}>
            <span>{t('ack.artists')}</span> <span className="tabular-nums">{credited.length}</span>
          </h4>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {credited.map(({ artist, count }) => {
              const entry = ENTRIES.get(artistEntryId(artist.name));
              return entry ? (
                <li key={artist.name}>
                  <EntryRow entry={entry} note={tn('ack.sprites', count)} onOpen={onOpen} />
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <Section label={t('ack.otherArtists')} count={others.length}>
          {/* Each name in one piece: "Involuntary Twitch" never breaks
              across two lines and reads as two people. */}
          <p className="text-sm leading-relaxed">
            {others.map((artist, i) => {
              // An artist whose sprites came another way still has an entry.
              const id = artistEntryId(artist);
              return (
                <span key={artist}>
                  <span className="whitespace-nowrap">
                    {ENTRIES.has(id) ? <EntryLink onClick={() => onOpen(id)}>{artist}</EntryLink> : artist}
                    {i < others.length - 1 ? ',' : ''}
                  </span>{' '}
                </span>
              );
            })}
          </p>
        </Section>
      )}
    </>
  );
}

const PACKAGE_INDEX = '/licenses/npm-packages.json';
let packageIndex: Promise<NpmPackageIndex> | undefined;

function loadPackageIndex(): Promise<NpmPackageIndex> {
  packageIndex ??= fetch(PACKAGE_INDEX).then((response) => {
    if (!response.ok) throw new Error(`${response.status} for ${PACKAGE_INDEX}`);
    return response.json() as Promise<NpmPackageIndex>;
  });
  packageIndex.catch(() => {
    packageIndex = undefined;
  });
  return packageIndex;
}

/**
 * The npm package list the build writes, so it changes with the
 * dependencies. It loads when the panel opens, never with the page.
 */
function usePackageIndex() {
  const [state, setState] = useState<{ index?: NpmPackageIndex; failed?: boolean }>({});
  useEffect(() => {
    let live = true;
    loadPackageIndex().then(
      (index) => live && setState({ index }),
      () => live && setState({ failed: true }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The packages grouped by license, the most used license first. */
function byLicense(index: NpmPackageIndex): [string, NpmPackage[]][] {
  const groups = new Map<string, NpmPackage[]>();
  for (const pkg of index.packages) {
    const list = groups.get(pkg.license) ?? [];
    groups.set(pkg.license, list);
    list.push(pkg);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'en'));
}

/** The npm packages by license, and the files that hold their license texts, each named for what it holds. */
function NpmPackages() {
  const t = useT();
  const tn = useTn();
  const locale = useLocale();
  const state = usePackageIndex();

  if (!state.index) {
    return (
      <p className="px-1 text-sm text-muted-foreground" role={state.failed ? 'alert' : undefined}>
        {state.failed ? t('ack.packagesFailed') : t('ack.loading')}
      </p>
    );
  }
  const names = new Intl.ListFormat(locale, { type: 'conjunction' });
  return (
    <>
      <Section label={t('ack.packages')} count={state.index.packages.length}>
        <div className="flex flex-col gap-3" data-testid="ack-packages">
          {byLicense(state.index).map(([license, packages]) => (
            <div key={license} className="flex flex-col gap-1">
              <h5 className="flex justify-between gap-2 text-sm font-semibold">
                <span>{license}</span> <span className="tabular-nums text-muted-foreground">{packages.length}</span>
              </h5>
              <ul className="text-sm leading-relaxed">
                {packages.map((pkg) => (
                  <li key={`${pkg.name}@${pkg.version}`} className="break-words">
                    {pkg.name}
                    {pkg.version && <span className="text-muted-foreground"> {pkg.version}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <Section label={t('ack.license')}>
        <ul className="-m-3 divide-y" data-testid="ack-package-files">
          {state.index.files.map(({ file, holds }) => (
            <li key={file}>
              <a
                href={`/licenses/${file}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">{tn('ack.packageTexts', holds.length)}</span>
                  {/* A short file names what it holds; the long one holds the list above. */}
                  <span className="break-words text-xs text-muted-foreground">
                    {holds.length <= 4 ? names.format(holds) : file}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/**
 * A quote's Markdown emphasis as the page shows it. The research wrote a
 * page's bold as `**…**`, and a README's own `*…*` is italic on GitHub.
 */
function emphasis(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*?|\*\*[^*]+$|\*[^*\s][^*]*\*)/).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.replace(/^\*\*|\*\*$/g, '')}</strong>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/**
 * A source's terms: its quote as written, with a link to the page it is on.
 * The research keeps one quote per source; a record with more shows each the
 * same way, one under the other, and a record with none shows nothing.
 */
function TermsQuotes({ quotes }: { quotes: readonly TermsQuote[] }) {
  if (!quotes.length) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="ack-terms">
      {quotes.map((quote) => (
        <figure key={quote.text} className="flex flex-col gap-1">
          <blockquote cite={quote.url} className="border-s-2 border-primary/40 ps-3 text-sm leading-relaxed">
            “{emphasis(quote.text)}”
          </blockquote>
          <figcaption className="ps-3">
            <a
              href={quote.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-start gap-1 rounded-sm text-xs font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="mt-px h-3 w-3 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 break-words">{host(quote.url)}</span>
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Detail({ entry, backRef, onBack, onOpen }: {
  entry: Acknowledgement;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const tn = useTn();
  const links = entry.links.map((href) => ({ href, label: t('ack.open', { site: entry.linkLabels?.[href] ?? host(href) }) }));
  // An entry that ships its license text needs no quote of the same words.
  const own = entry.kind === 'artist' ? artistTerms(entry.name) : { quotes: entry.texts ? [] : sourceTerms(entry.id) };
  const shared = own.sharedWith ? ENTRIES.get(own.sharedWith) : undefined;
  const hasLicense = entry.license || own.quotes.length > 0 || shared || entry.note || entry.texts;
  const shown = entry.kind === 'project' ? projectSpriteCount(entry.id) : 0;
  const projectOnly = entry.kind === 'project' ? projectOnlySprites(entry.id) : [];
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-2 py-1.5">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          {t('ack.back')}
        </button>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-3 pb-6">
        <div>
          <h3 className="break-words text-base font-semibold leading-snug" data-testid="ack-detail-name">
            {entry.name}
          </h3>
          {entry.by && <p className="text-sm text-muted-foreground">{t('ack.by', { name: entry.by })}</p>}
          {entry.compiledBy && <p className="text-sm text-muted-foreground">{t('ack.compiledBy', { name: entry.compiledBy })}</p>}
        </div>
        <Section label={t('ack.usedFor')}>
          {entry.kind === 'artist' ? (
            <ArtistSprites name={entry.name} onOpenProject={onOpen} />
          ) : (
            <>
              <p className="text-sm leading-relaxed">{entry.usedFor}</p>
              {shown > 0 && <p className="text-sm leading-relaxed" data-testid="ack-project-count">{tn('ack.shownFrom', shown)}</p>}
            </>
          )}
        </Section>
        {entry.kind === 'project' && <ProjectArtists id={entry.id} onOpen={onOpen} />}
        {projectOnly.length > 0 && (
          <Section label={t('ack.projectOnly')} count={projectOnly.length}>
            <ProjectOnlySprites sprites={projectOnly} />
          </Section>
        )}
        {entry.kind === 'packages' && <NpmPackages />}
        <ExternalLinks links={links} />
        {hasLicense && (
          <Section label={t('ack.license')}>
            {entry.license && <p className="text-sm font-medium leading-relaxed">{entry.license}</p>}
            <TermsQuotes quotes={own.quotes} />
            {shared && (
              <p className="text-sm leading-relaxed">
                {withNode(t('ack.termsOf', { source: '\u0000' }), <EntryLink onClick={() => onOpen(shared.id)}>{shared.name}</EntryLink>)}
              </p>
            )}
            {entry.note && <p className="text-sm leading-relaxed">{entry.note}</p>}
            {entry.texts?.map((file) => (
              <LicenseText key={file.file} file={file} titled={entry.texts!.length > 1} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * The list and the open entries, in the two levels Cursor's acknowledgements
 * page uses: a row slides its detail in over the list, and Back slides it out.
 * A link to another entry, such as a project's artist, opens it in the same
 * detail level, and Back returns to the entry it came from, where the reader
 * left it.
 *
 * Both levels stay mounted and scroll on their own, so Back returns to the
 * list where the reader left it. The level that is not on screen is `inert`,
 * so neither Tab, find-in-page nor a screen reader lands in it. That is also
 * why the closed detail is only moved out, not hidden: a `visibility`
 * transition is still `hidden` on the frame the Back button takes focus.
 */
function AcknowledgementsBody() {
  const t = useT();
  const tn = useTn();
  const rowNote = useRowNote();
  // The open entries, the one on screen last. Empty shows the list.
  const [stack, setStack] = useState<string[]>([]);
  // The last entry opened. It stays rendered while the detail slides out.
  const [shownId, setShownId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  // Each open entry's scroll position, restored when Back returns to it.
  const scrolls = useRef<number[]>([]);
  const shown = shownId ? ENTRIES.get(shownId) : undefined;
  const openId = stack.at(-1) ?? null;

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // `preventScroll`: the levels sit side by side in a clipped box, and a
  // focus that scrolls would shift that box sideways.
  useEffect(() => {
    if (openId) backRef.current?.focus({ preventScroll: true });
    else if (shownId) {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-ack-id="${CSS.escape(shownId)}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [openId, shownId]);

  const open = (id: string) => {
    scrolls.current = [];
    setShownId(id);
    setStack([id]);
    if (detailRef.current) detailRef.current.scrollTop = 0;
  };
  const follow = (id: string) => {
    if (!ENTRIES.has(id)) return;
    scrolls.current.push(detailRef.current?.scrollTop ?? 0);
    setShownId(id);
    setStack((ids) => [...ids, id]);
    if (detailRef.current) detailRef.current.scrollTop = 0;
  };
  const back = () => {
    if (stack.length > 1) {
      const previous = stack[stack.length - 2];
      setShownId(previous);
      setStack((ids) => ids.slice(0, -1));
      const top = scrolls.current.pop() ?? 0;
      requestAnimationFrame(() => {
        if (detailRef.current) detailRef.current.scrollTop = top;
      });
    } else {
      // The list focuses the row the reader first opened.
      setShownId(stack[0] ?? null);
      setStack([]);
    }
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="relative h-full overflow-hidden outline-none">
      <div
        inert={openId !== null}
        className="absolute inset-0 overflow-y-auto overscroll-contain pb-6"
        data-testid="ack-list"
      >
        <p className="px-4 pt-3 text-sm leading-relaxed text-muted-foreground">{t('ack.intro')}</p>
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          {tn('ack.count', ENTRIES.size)}
        </p>
        {GROUPS.map((group) => (
          <section key={group.id} className="pt-5" data-testid={`ack-group-${group.id}`}>
            <h3 className={cn(HEADING, 'flex justify-between px-5 pb-1.5')}>
              <span>{t(GROUP_KEYS[group.id])}</span>{' '}
              <span className="tabular-nums">{group.entries.length}</span>
            </h3>
            <ul className="mx-4 divide-y overflow-hidden rounded-lg border bg-card">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <EntryRow entry={entry} note={rowNote(entry)} onOpen={open} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div
        ref={detailRef}
        inert={openId === null}
        className={cn(
          'absolute inset-0 overflow-y-auto overscroll-contain bg-background',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          openId ? 'translate-x-0' : 'translate-x-full',
        )}
        data-testid="ack-detail"
      >
        {shown && <Detail key={shown.id} entry={shown} backRef={backRef} onBack={back} onOpen={follow} />}
      </div>
    </div>
  );
}

/**
 * The footer's Acknowledgements panel: the app's bottom sheet on a phone, and
 * on desktop the right-hand pane the export settings use, with the View
 * settings pane's header.
 *
 * Escape is taken in the capture phase and stopped there. The footer also
 * sits inside the View settings pane and the Pokémon browser sheet, and their
 * own Escape handlers would otherwise close them too.
 */
export function AcknowledgementsPanel({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const t = useT();
  const isDesktop = useViewportAtLeast(1024);

  const close = useCallback(() => {
    onClose();
    anchor?.focus({ preventScroll: true });
  }, [anchor, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  if (!isDesktop) {
    return (
      <BottomSheet onClose={close} title={t('ack.title')} closeLabel={t('ack.title')} size="full">
        <AcknowledgementsBody />
      </BottomSheet>
    );
  }

  return createPortal(
    <div data-overlay>
      <div className="fixed inset-0 z-[140] bg-black/20" onClick={close} aria-hidden />
      <aside
        role="dialog"
        aria-label={t('ack.title')}
        className="fixed inset-y-0 end-0 z-[150] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col border-s bg-background shadow-xl"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold text-foreground">{t('ack.title')}</span>
          <button
            type="button"
            onClick={close}
            className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t('browser.close')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AcknowledgementsBody />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
