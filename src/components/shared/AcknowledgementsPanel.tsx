import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { formatNumber, useLocale, useT, useTn, type NoArgKey } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import {
  ACKNOWLEDGEMENTS,
  type Acknowledgement,
  type AcknowledgementGroupId,
  type LicenseFile,
} from '@/data/acknowledgements';
import type { NpmPackageIndex } from '@/data/npmPackages';
import { artistTerms, sourceTerms, type TermsQuote } from '@/data/creditTerms';
import { artistCredit, bundleCredit, bundlesCrediting, pokeapiDelivery } from '@/data/spriteCredits';
import { ArtistSprites } from './AcknowledgementsSprites';
import { BundleArtists } from './AcknowledgementsArtists';

const GROUP_KEYS = {
  'sprite-projects': 'ack.group.spriteSources',
  'sprite-artists': 'ack.group.spriteArtists',
  'pokemon-art': 'ack.group.pokemonArt',
  'interface-icons': 'ack.group.interfaceIcons',
  fonts: 'ack.group.fonts',
  data: 'ack.group.data',
  code: 'ack.group.code',
} as const satisfies Record<AcknowledgementGroupId, NoArgKey>;

const GROUPS = ACKNOWLEDGEMENTS.filter((group) => group.entries.length > 0);

const ENTRIES = new Map(GROUPS.flatMap((group) => group.entries.map((entry) => [entry.id, entry] as const)));

const BUNDLE_IDS = GROUPS.find((group) => group.id === 'sprite-projects')?.entries.map((entry) => entry.id) ?? [];

const licenseTexts = new Map<string, Promise<string>>();

function loadLicense(file: string): Promise<string> {
  let text = licenseTexts.get(file);
  if (!text) {
    text = fetch(`/licenses/${file}`).then((response) => {
      if (!response.ok) throw new Error(`${response.status} for ${file}`);
      return response.text();
    });
    text.catch(() => licenseTexts.delete(file));
    licenseTexts.set(file, text);
  }
  return text;
}

const host = (href: string) => new URL(href, window.location.href).hostname.replace(/^www\./, '');

const indent = (line: string) => line.length - line.trimStart().length;
const isRule = (line: string) => /^\s*[=\-_*]{3,}\s*$/.test(line);
const RULE_COLUMNS = 32;
const isHeading = (line: string) => {
  const text = line.trim();
  return text.startsWith('#')
    || (/[A-Z]/.test(text) && !/[a-z]/.test(text) && text.length <= 40 && !/[.,;:]$/.test(text));
};
const LIST_MARKER = /^([*\-•+]|\d+(\.\d+)*[.)]|\(?[a-z0-9]{1,3}\))\s+/i;
const isListItem = (line: string) => LIST_MARKER.test(line.trimStart());

function continues(prev: string, line: string, beforePrev: string | undefined): boolean {
  if (!prev.trim() || !line.trim()) return false;
  if (isRule(line) || isRule(prev) || isHeading(line) || isHeading(prev)) return false;
  if (isListItem(line) && /[.:;!?)"'”]$/.test(prev.trim())) return false;
  const [from, to] = [indent(prev), indent(line)];
  if (to === from) return true;
  if (to < from) return !beforePrev?.trim() && !isListItem(prev);
  const marker = LIST_MARKER.exec(prev.trimStart());
  return marker !== null && to === from + marker[0].length;
}

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

const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

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

function EntryRow({ entry, note, onOpen }: { entry: Acknowledgement; note: string; onOpen: (id: string) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      data-ack-id={entry.id}
      onClick={() => onOpen(entry.id)}
      className="flex w-full cursor-pointer items-center gap-0 py-2.5 ps-2 pe-0 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{entry.name}</span>
          {entry.by && <> <span className="inline-block max-w-full">{t('ack.by', { name: entry.by })}</span></>}
        </span>
        <span className="break-words text-xs text-muted-foreground">{note}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function useRowNote() {
  const t = useT();
  const tn = useTn();
  const index = usePackageIndex();
  return (entry: Acknowledgement) => {
    if (entry.kind === 'artist') return tn('ack.sprites', artistCredit(entry.name)?.sprites.length ?? 0);
    if (entry.kind === 'packages') {
      if (!index.index) return index.failed ? t('ack.packagesFailed') : t('ack.loading');
      return `${tn('ack.packageCount', packageCount(index.index))} · ${tn('ack.licenseCount', byLicense(index.index).length)}`;
    }
    const bundle = entry.kind === 'project' ? bundleCredit(entry.id) : undefined;
    if (bundle) {
      const sprites = projectSprites(entry.id, bundle.sprites);
      return [tn('ack.sprites', sprites, { count: formatNumber(sprites) }), entry.license].filter(Boolean).join(' · ');
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

interface PackageName { name: string; license: string; versions: string[] }

function byLicense(index: NpmPackageIndex): [string, PackageName[]][] {
  const byName = new Map<string, PackageName>();
  for (const pkg of index.packages) {
    const entry = byName.get(pkg.name) ?? { name: pkg.name, license: pkg.license, versions: [] };
    byName.set(pkg.name, entry);
    if (pkg.version) entry.versions.push(pkg.version);
  }
  const groups = new Map<string, PackageName[]>();
  for (const pkg of byName.values()) {
    const list = groups.get(pkg.license) ?? [];
    groups.set(pkg.license, list);
    list.push(pkg);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'en'));
}

const packageCount = (index: NpmPackageIndex) => new Set(index.packages.map((pkg) => pkg.name)).size;

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
      <Section label={t('ack.packages')} count={packageCount(state.index)}>
        <div className="flex flex-col gap-3" data-testid="ack-packages">
          {byLicense(state.index).map(([license, packages]) => (
            <div key={license} className="flex flex-col gap-1">
              <h5 className="flex justify-between gap-2 text-sm font-semibold">
                <span>{license}</span> <span className="tabular-nums text-muted-foreground">{packages.length}</span>
              </h5>
              <ul className="text-sm leading-relaxed">
                {packages.map((pkg) => (
                  <li key={pkg.name} className="break-words">
                    {pkg.name}
                    {pkg.versions.length > 0 && <span className="text-muted-foreground"> {pkg.versions.join(', ')}</span>}
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
                  <span className="text-sm font-semibold">{tn('ack.packageTexts', new Set(holds).size)}</span>
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

const isMarkdown = (url: string) => /\.md(?:$|[?#])/i.test(url);

function quoteText(quote: TermsQuote): ReactNode {
  if (!isMarkdown(quote.url)) return quote.text;
  const text = quote.text
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function TermsQuotes({ quotes }: { quotes: readonly TermsQuote[] }) {
  if (!quotes.length) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="ack-terms">
      {quotes.map((quote) => (
        <figure key={quote.text} className="flex flex-col gap-1">
          <blockquote cite={quote.url} className="whitespace-pre-line border-s-2 border-primary/40 ps-3 text-sm leading-relaxed">
            “{quoteText(quote)}”
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

/** Sprites in the app that come from or through a sprite project. PokéAPI also delivers official and Smogon sprites. */
function projectSprites(id: string, credited: number): number {
  if (id !== 'pokeapi-sprites') return credited;
  const delivery = pokeapiDelivery();
  return delivery.official + delivery.smogon + delivery.own;
}

/** A sprite project's "Used for" text, with its counts from the credit data. */
function useProjectUse() {
  const t = useT();
  return (id: string): string | undefined => {
    const delivery = pokeapiDelivery();
    const files = bundleCredit(id)?.sprites ?? 0;
    switch (id) {
      case 'pokeapi-sprites':
        return t('ack.usedPokeapi', {
          total: formatNumber(projectSprites(id, delivery.own)),
          official: formatNumber(delivery.official),
          smogon: formatNumber(delivery.smogon),
          own: formatNumber(delivery.own),
        });
      case 'smogon-sprite-project':
        return t('ack.usedSmogon', { drawn: files, delivered: delivery.smogon });
      case 'gen9-resource-pack':
        return t('ack.usedGen9Pack', { files });
      default:
        return undefined;
    }
  };
}

function Detail({ entry, backRef, onBack }: {
  entry: Acknowledgement;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
}) {
  const t = useT();
  const tn = useTn();
  const usedFor = useProjectUse()(entry.id) ?? entry.usedFor;
  const links = entry.links.map((href) => ({ href, label: t('ack.open', { site: entry.linkLabels?.[href] ?? host(href) }) }));
  const bundle = entry.kind === 'project' ? bundleCredit(entry.id) : undefined;
  const alsoThrough = entry.kind === 'artist' ? bundlesCrediting(entry.name, BUNDLE_IDS) : [];
  const quotes = entry.kind === 'artist' ? artistTerms(entry.name) : entry.texts ? [] : sourceTerms(entry.id);
  const hasLicense = entry.license || quotes.length > 0 || entry.note || entry.texts;
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
            <ArtistSprites name={entry.name} summary={entry.usedFor} />
          ) : (
            <p className="text-sm leading-relaxed">{usedFor}</p>
          )}
        </Section>
        {alsoThrough.length > 0 && (
          <Section label={t('ack.alsoCredited')}>
            <ul className="-my-1.5 divide-y" data-testid="ack-also-credited">
              {alsoThrough.map(([id, files]) => (
                <li key={id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 break-words">{ENTRIES.get(id)?.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{tn('ack.sprites', files)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {entry.kind === 'packages' && <NpmPackages />}
        <ExternalLinks links={links} />
        {hasLicense && (
          <Section label={t('ack.license')}>
            {entry.license && <p className="text-sm font-medium leading-relaxed">{entry.license}</p>}
            <TermsQuotes quotes={quotes} />
            {entry.note && <p className="text-sm leading-relaxed">{entry.note}</p>}
            {entry.texts?.map((file) => (
              <LicenseText key={file.file} file={file} titled={entry.texts!.length > 1} />
            ))}
          </Section>
        )}
        {bundle && (
          <Section label={t('ack.artists')} count={bundle.artists.length}>
            <BundleArtists entry={bundle} />
          </Section>
        )}
      </div>
    </div>
  );
}

function AcknowledgementsBody() {
  const t = useT();
  const tn = useTn();
  const rowNote = useRowNote();
  const [stack, setStack] = useState<string[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const scrolls = useRef<number[]>([]);
  const shown = shownId ? ENTRIES.get(shownId) : undefined;
  const openId = stack.at(-1) ?? null;

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

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
        {shown && <Detail key={shown.id} entry={shown} backRef={backRef} onBack={back} />}
      </div>
    </div>
  );
}

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
