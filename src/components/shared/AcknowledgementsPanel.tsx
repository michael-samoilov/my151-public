import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useT, useTn, type NoArgKey } from '@/i18n';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { cn } from '@/lib/utils';
import {
  ACKNOWLEDGEMENTS,
  SPRITE_CREDIT_IDS,
  type Acknowledgement,
  type AcknowledgementGroupId,
  type LicenseFile,
  type SpriteCreditId,
} from '@/data/acknowledgements';
import { spritesBySource } from '@/data/spriteCredits';
import { AcknowledgementsSprites } from './AcknowledgementsSprites';

const GROUP_KEYS = {
  sprites: 'ack.group.sprites',
  icons: 'ack.group.icons',
  fonts: 'ack.group.fonts',
  data: 'ack.group.data',
  code: 'ack.group.code',
} as const satisfies Record<AcknowledgementGroupId, NoArgKey>;

const isSpriteCredit = (id: string): id is SpriteCreditId => (SPRITE_CREDIT_IDS as readonly string[]).includes(id);

/**
 * The groups as shown. A sprite source with no sprite in this build stays
 * out, so a source appears once its sprites ship and leaves when they go.
 */
const GROUPS = ACKNOWLEDGEMENTS.map((group) => ({
  ...group,
  entries: group.entries.filter((entry) => !isSpriteCredit(entry.id) || spritesBySource(entry.id).length > 0),
})).filter((group) => group.entries.length > 0);

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
 * otherwise wrap it on a phone.
 */
function reflow(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '').split('\n');
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && continues(lines[i - 1], line, lines[i - 2])) out[out.length - 1] += ` ${line.trim()}`;
    else out.push(indent(line) >= 12 ? line.trim() : line.trimEnd());
  });
  return out.join('\n');
}

/** The small-caps heading the View settings pane uses for its sections. */
const HEADING = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className={HEADING}>{label}</h4>
      {children}
    </section>
  );
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
          className="whitespace-pre-wrap break-words rounded-md border bg-card p-3 font-mono text-xs leading-relaxed text-foreground/90"
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

function Detail({ entry, backRef, onBack }: {
  entry: Acknowledgement;
  backRef: RefObject<HTMLButtonElement | null>;
  onBack: () => void;
}) {
  const t = useT();
  const licenseLine = entry.terms ?? entry.license;
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-2 py-1.5">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          {t('ack.back')}
        </button>
      </div>
      <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
        <div>
          <h3 className="break-words text-base font-semibold leading-snug" data-testid="ack-detail-name">
            {entry.name}
          </h3>
          {entry.by && <p className="text-sm text-muted-foreground">{t('ack.by', { name: entry.by })}</p>}
        </div>
        <Section label={t('ack.usedFor')}>
          <p className="text-sm leading-relaxed">{entry.usedFor}</p>
        </Section>
        {isSpriteCredit(entry.id) && <AcknowledgementsSprites source={entry.id} />}
        {entry.artists && (
          <Section label={t('ack.artists')}>
            {/* Each name in one piece: "Involuntary Twitch" never breaks
                across two lines and reads as two people. */}
            <p className="text-sm leading-relaxed">
              {entry.artists.map((artist, i) => (
                <span key={artist}>
                  <span className="whitespace-nowrap">{artist}{i < entry.artists!.length - 1 ? ',' : ''}</span>{' '}
                </span>
              ))}
            </p>
          </Section>
        )}
        <div className="flex flex-wrap gap-2">
          {entry.links.map((href) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {t('ack.open', { site: entry.linkLabels?.[href] ?? host(href) })}
            </a>
          ))}
        </div>
        {(licenseLine || entry.texts) && (
          <Section label={t('ack.license')}>
            {licenseLine && <p className="text-sm leading-relaxed">{licenseLine}</p>}
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
 * The list and the open entry, in the two levels Cursor's acknowledgements
 * page uses: a row slides its detail in over the list, and Back slides it out.
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
  const [openId, setOpenId] = useState<string | null>(null);
  // The last entry opened. It stays rendered while the detail slides out.
  const [shownId, setShownId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const shown = shownId ? ENTRIES.get(shownId) : undefined;

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // `preventScroll`: the levels sit side by side in a clipped box, and a
  // focus that scrolls would shift that box sideways.
  useEffect(() => {
    if (openId) backRef.current?.focus({ preventScroll: true });
    else if (shownId) {
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-ack-id="${shownId}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [openId, shownId]);

  const open = (id: string) => {
    setShownId(id);
    setOpenId(id);
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
          <section key={group.id} className="pt-4" data-testid={`ack-group-${group.id}`}>
            <h3 className={cn(HEADING, 'flex justify-between px-4 pb-1')}>
              <span>{t(GROUP_KEYS[group.id])}</span>{' '}
              <span className="tabular-nums">{group.entries.length}</span>
            </h3>
            <ul className="mx-4 divide-y">
              {group.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-ack-id={entry.id}
                    onClick={() => open(entry.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      {/* Two boxes, each with its own ellipsis: the credit
                          gives way first, and the name only past the row. */}
                      <span className="flex min-w-0 items-baseline gap-1 text-sm">
                        <span className="max-w-full shrink-0 truncate font-medium">{entry.name}</span>
                        {entry.by && (
                          <span className="min-w-0 truncate text-muted-foreground">{t('ack.by', { name: entry.by })}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.license ?? t('ack.credit')}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div
        inert={openId === null}
        className={cn(
          'absolute inset-0 overflow-y-auto overscroll-contain bg-background',
          'transition-transform duration-200 ease-out motion-reduce:transition-none',
          openId ? 'translate-x-0' : 'translate-x-full',
        )}
        data-testid="ack-detail"
      >
        {shown && <Detail key={shown.id} entry={shown} backRef={backRef} onBack={() => setOpenId(null)} />}
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
