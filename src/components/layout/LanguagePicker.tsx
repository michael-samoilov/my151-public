import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { PokeBallSpinner } from '@/components/shared/PokeBallSpinner';
import { pathScale } from '@/lib/pathScale';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { pressedOutside } from '@/lib/outsidePress';
import { usePokedexStore } from '@/store/usePokedexStore';
import { applyLocale } from '@/i18n/bootstrap';
import { LOCALES, LOCALE_META, htmlLang, useLocale, useT, type Locale } from '@/i18n';

/**
 * Language selection.
 *
 * Endonyms, never flags. Languages are not countries: Spanish spans twenty of
 * them, zh-Hans/zh-Hant are *scripts* with no correct single flag and a
 * politically loaded wrong one, English is not the UK, flag emoji have no
 * glyphs on Windows, and screen readers announce them as country names — which
 * is simply wrong information. Someone who cannot read 日本語 does not want
 * Japanese, so the endonym alone is the honest affordance.
 *
 * Order is fixed and never re-sorted by recency: muscle memory beats relevance
 * for a list this short.
 *
 * Mobile gets a bottom sheet and desktop a dropdown — the same shape-differs-
 * by-breakpoint treatment the rest of the app uses, rather than one scaled.
 */

/**
 * The nine languages as a wrapping chip row.
 *
 * A list would be the conventional shape, and it is the wrong one here. Nine
 * endonyms are 3-8 characters each — a list gives every one of them a full-width
 * row and reads as a menu to traverse, when what this is is a small closed set
 * to scan at once. Wrapping chips cut the mobile sheet from nine rows to three
 * and put the whole vocabulary on screen without scrolling.
 *
 * It is also the vocabulary the rest of the app already speaks: the browser's
 * filters and the feedback categories are both wrapping chip rows, and a
 * dropdown list here would have been the only one of its kind.
 *
 * Order stays fixed and is never re-sorted by recency — muscle memory beats
 * relevance for a set this size, and a chip that moves is worse than a row that
 * moves because there is no column to anchor it.
 */
function LocaleChips({ onPick, pending }: { onPick: (l: Locale) => void; pending: Locale | null }) {
  const active = useLocale();
  return (
    <div role="menu" className="grid grid-cols-3 gap-1.5 p-3">
      {LOCALES.map((locale) => {
        const meta = LOCALE_META[locale];
        const selected = locale === active;
        return (
          <button
            key={locale}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            onClick={() => onPick(locale)}
            // 36px, and a 44px touch target on the sheet via the row gap plus
            // the sheet's own padding — a chip grid cannot give every item the
            // full 44 without looking like buttons rather than chips.
            // `justify-center` and a grid column rather than a wrapping row:
            // uniform chips read as one set of nine, where ragged ones read as
            // three unrelated rows. The check sits inside the chip rather than
            // in a gutter, so a chip's width does not change when it is picked.
            className={`inline-flex items-center justify-center gap-1 px-2 min-h-9 rounded-full border text-sm cursor-pointer transition-colors ${
              selected
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {pending === locale && <PokeBallSpinner tone="line" className="w-3.5 h-3.5" />}
            {selected && pending !== locale && <Check className="w-3.5 h-3.5" />}
            {/* `lang` so a screen reader pronounces the endonym in its own
                language rather than reading it through the page's voice. */}
            <span lang={htmlLang(locale)} data-i18n-exempt="endonym">{meta.endonym}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LanguagePicker() {
  const t = useT();
  const setLocale = usePokedexStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Locale | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    async (locale: Locale) => {
      setPending(locale);
      // Await the catalog before committing the choice, so no render can show
      // the new language against the old strings.
      await applyLocale(locale);
      setLocale(locale);
      setPending(null);
      setOpen(false);
    },
    [setLocale],
  );

  // Click-outside and Escape, matching the builder's settings menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pressedOutside(rootRef.current, e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('lang.change')}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-9 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        {/* The globe alone, at every width. It briefly carried the current
            language's endonym from `sm:` up, on the theory that the extra word
            aided discovery. It does not: a globe is already the near-universal
            sign for this control, and the word beside it is in the language
            someone opening the menu is most likely trying to leave. Dropping it
            also takes a variable-width string out of the header's tightest
            row. */}
        {/* 104%: balanced with the report bug beside it (see FeedbackButton). */}
        <Globe className="w-4 h-4" {...pathScale(1.04)} />
      </button>

      {/* Desktop: anchored dropdown. */}
      {open && (
        <div className="hidden md:block absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-[120] w-[22rem]">
          <LocaleChips onPick={pick} pending={pending} />
        </div>
      )}

      {/* Mobile: bottom sheet, sized to content. */}
      {open && (
        <div className="md:hidden">
          <BottomSheet onClose={() => setOpen(false)} closeLabel={t('lang.title')} title={t('lang.title')}>
            <div className="pb-2">
              <LocaleChips onPick={pick} pending={pending} />
            </div>
          </BottomSheet>
        </div>
      )}
    </div>
  );
}
