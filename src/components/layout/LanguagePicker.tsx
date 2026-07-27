import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Globe, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
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

function LocaleList({ onPick, pending }: { onPick: (l: Locale) => void; pending: Locale | null }) {
  const active = useLocale();
  return (
    <div role="menu" className="py-1">
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
            // Minimum 44px touch target (Apple HIG), as elsewhere in the app.
            className={`w-full flex items-center gap-2 px-3 min-h-11 text-left text-sm transition-colors cursor-pointer ${
              selected ? 'text-primary font-medium' : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="w-4 shrink-0">
              {pending === locale ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : selected ? (
                <Check className="w-3.5 h-3.5" />
              ) : null}
            </span>
            {/* `lang` so a screen reader pronounces the endonym in its own
                language rather than reading it through the page's voice. */}
            <span lang={htmlLang(locale)}>{meta.endonym}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LanguagePicker() {
  const t = useT();
  const active = useLocale();
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
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
        <Globe className="w-4 h-4" />
        {/* The current language, from `sm:` up — there is room, and it doubles
            as discoverability. Never on mobile: it would be rendered in the
            language the user is trying to leave. */}
        <span className="hidden sm:inline text-xs" lang={htmlLang(active)}>
          {LOCALE_META[active].endonym}
        </span>
      </button>

      {/* Desktop: anchored dropdown. */}
      {open && (
        <div className="hidden md:block absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-[120] min-w-[10rem]">
          <LocaleList onPick={pick} pending={pending} />
        </div>
      )}

      {/* Mobile: bottom sheet, sized to content. */}
      {open && (
        <div className="md:hidden">
          <BottomSheet onClose={() => setOpen(false)} closeLabel={t('lang.title')} title={t('lang.title')}>
            <div className="pb-2">
              <LocaleList onPick={pick} pending={pending} />
            </div>
          </BottomSheet>
        </div>
      )}
    </div>
  );
}
