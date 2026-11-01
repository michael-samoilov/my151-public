import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { PokeBallSpinner } from '@/components/shared/PokeBallSpinner';
import { pathScale } from '@/lib/pathScale';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { pressedOutside } from '@/lib/outsidePress';
import { usePokedexStore } from '@/store/usePokedexStore';
import { applyLocale } from '@/i18n/bootstrap';
import { LOCALES, LOCALE_META, htmlLang, useLocale, useT, type Locale } from '@/i18n';

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
            className={`inline-flex items-center justify-center gap-1 px-2 min-h-9 rounded-full border text-sm cursor-pointer transition-colors ${
              selected
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {pending === locale && <PokeBallSpinner tone="line" className="w-3.5 h-3.5" />}
            {selected && pending !== locale && <Check className="w-3.5 h-3.5" />}
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
      await applyLocale(locale);
      setLocale(locale);
      setPending(null);
      setOpen(false);
    },
    [setLocale],
  );

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
        className="relative before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] flex items-center gap-1 h-9 px-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Globe className="w-4 h-4" {...pathScale(1.04)} />
      </button>

      {open && (
        <div className="hidden md:block absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-[120] w-[22rem]">
          <LocaleChips onPick={pick} pending={pending} />
        </div>
      )}

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
