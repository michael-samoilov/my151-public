import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/input';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { raw, typeLabel, useLocale, useT, useTn } from '@/i18n';
import { splitTemplate } from '@/lib/richTemplate';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/utils';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { slotLabel } from '../slotLabel';
import { TYPE_COLORS } from '@/data/type-colors';
import { movesForPicker } from '../filterMoves';
import {
  CATEGORY_COLORS,
  CATEGORY_LABEL,
  CONTEST_COLORS,
  CONTEST_LABEL,
  CONTEST_TYPES,
  type ContestType,
  type Move,
} from '../moves';
import { useMoveNames } from '../moveNames';
import { CategoryChip } from './CategoryChip';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * The TM picker, on the selection pane's architecture: a BottomSheet on
 * mobile (the pane's own drag-to-dismiss), a centred dialog on desktop, and
 * the pane's filter idiom — entry chips that open an inline panel,
 * multi-select values as dismissible coloured chips, an or/and mode for
 * types. Fields run Type, Cat., Move, Att., Acc., PP; Move and the numeric
 * columns sort, and a move that always hits carries no accuracy and sorts
 * above 100%.
 */

type SortKey = 'name' | 'pp' | 'power' | 'accuracy';
type FilterSheet = 'type' | 'category' | 'contest' | null;

const CATEGORIES: Move['category'][] = ['physical', 'special', 'status'];

function SortCaret({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <svg data-sort-caret viewBox="0 0 12 12" className={cn('mr-[2px] h-[9px] w-[9px] shrink-0', dir === 'desc' && 'rotate-180')}>
      <path
        d="M3 7.5 L6 4 L9 7.5"
        fill="none"
        stroke={dir ? '#0a0a0a' : '#d4d4d4'}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Entry-point chip — the pane's recipe: opens a filter panel. */
function EntryChip({ label, onClick, active, testId }: {
  label: string;
  onClick: () => void;
  active: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
    >
      {label}
      <ChevronDown size={12} className={cn('transition-transform', active && 'rotate-180')} />
    </button>
  );
}

/** Active filter chip — the pane's recipe: shows the value with a dismiss. */
function FilterChip({ label, onDismiss, onClick, className, style, testId }: {
  label: string;
  onDismiss: () => void;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', className)}
      style={style}
    >
      <button type="button" onClick={onClick} data-testid={testId} className="cursor-pointer">
        {label}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="cursor-pointer hover:opacity-70"
      >
        <X size={10} />
      </button>
    </span>
  );
}

/** A coloured multi-select option chip inside the category/contest panels. */
function OptionChip({ label, active, colour, onClick }: {
  label: string;
  active: boolean;
  colour: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
      style={active ? { background: colour } : undefined}
    >
      {label}
    </button>
  );
}

function PickerBody({ cardIndex, onClose }: { cardIndex: number; onClose: () => void }) {
  const t = useT();
  const tn = useTn();
  const locale = useLocale();
  const names = useMoveNames();
  const nameOf = (m: Move) => names?.[m.id] ?? m.name;
  const setTm = useLeagueStore((s) => s.setTm);
  const cardType = useLeagueStore((s) => s.cards[cardIndex]?.type ?? null);

  const [search, setSearch] = useState('');
  // The leader's own type arrives pre-selected, exactly as the selection
  // pane pre-selects it for line picks.
  const [typeFilter, setTypeFilter] = useState<TypeName[] | null>(
    cardType && cardType !== 'none' ? [cardType] : null,
  );
  const [categories, setCategories] = useState<Move['category'][]>([]);
  const [contests, setContests] = useState<ContestType[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openSheet, setOpenSheet] = useState<FilterSheet>(null);

  const toggleType = (type: TypeName) =>
    setTypeFilter((cur) => {
      const list = cur ?? [];
      const next = list.includes(type) ? list.filter((x) => x !== type) : [...list, type];
      return next.length > 0 ? next : null;
    });
  const toggleCategory = (c: Move['category']) =>
    setCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const toggleContest = (c: ContestType) =>
    setContests((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const isSearching = search.trim().length > 0;
  const hasActiveFilters = !!typeFilter || categories.length > 0 || contests.length > 0;
  const clearFilters = () => {
    setTypeFilter(null);
    setCategories([]);
    setContests([]);
  };

  const results = useMemo(() => {
    const filtered = movesForPicker(search, {
      types: typeFilter,
      categories,
      contests,
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const num = (v: number | null) => (v === null ? 101 : v); // always-hits above 100%
    // By the name on screen, in the language's own order.
    const collator = new Intl.Collator(locale);
    const label = (m: Move) => names?.[m.id] ?? m.name;
    const byName = (a: Move, b: Move) => collator.compare(label(a), label(b));
    filtered.sort((a, b) => {
      if (sortKey === 'name') return dir * byName(a, b);
      if (sortKey === 'pp') return dir * (a.pp - b.pp) || byName(a, b);
      if (sortKey === 'power') return dir * ((a.power ?? -1) - (b.power ?? -1)) || byName(a, b);
      return dir * (num(a.accuracy) - num(b.accuracy)) || byName(a, b);
    });
    return filtered;
  }, [search, typeFilter, categories, contests, sortKey, sortDir, locale, names]);

  // A name wraps at its spaces onto a second line. A word wider than the
  // column on its own (German Elektrifizierung, at 320 px) shrinks to fit,
  // as the card's TM slot does, rather than being cut.
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const fit = () => {
      const spans = [...list.querySelectorAll<HTMLElement>('[data-tm-row-name]')];
      for (const el of spans) el.style.fontSize = '';
      const base = spans.length ? parseFloat(getComputedStyle(spans[0]).fontSize) : 0;
      const over = spans.map((el) => [el, el.clientWidth / el.scrollWidth] as const);
      for (const [el, ratio] of over) if (ratio < 0.995) el.style.fontSize = `${base * ratio}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(list);
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [results, names]);

  const header = (key: SortKey, label: string, right = false) => (
    <button
      type="button"
      onClick={() => {
        if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else {
          setSortKey(key);
          setSortDir('asc');
        }
      }}
      className={cn(
        // One line: a CJK head such as 威力 would otherwise break between
        // its two characters in the narrow numeric columns.
        'flex items-center whitespace-nowrap text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
        right && 'justify-end',
      )}
    >
      {right && <SortCaret dir={sortKey === key ? sortDir : null} />}
      {label}
      {!right && <SortCaret dir={sortKey === key ? sortDir : null} />}
    </button>
  );

  const toggleSheet = (sheet: Exclude<FilterSheet, null>) =>
    setOpenSheet((cur) => (cur === sheet ? null : sheet));

  const grid = { gridTemplateColumns: '4.5rem 2.125rem 1fr 1.875rem 2.375rem 1.5rem', columnGap: '0.375rem' };

  return (
    // h-full fills the sheet's definite-height scroll container on mobile;
    // flex-1/min-h-0 size it inside the desktop dialog's flex column.
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-3 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="tm-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('league.tm.search')}
            className="pl-9"
          />
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{tn('league.tm.found', results.length)}</span>
      </div>

      {/* Filter chip row — the selection pane's idiom. `shrink-0` is
          load-bearing: `overflow-x-auto` sets this flex child's automatic
          minimum size to zero, so without it the column's flex-shrink crushed
          the row below its content and clipped the chips top and bottom. */}
      <div className={cn(
        'flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-2 no-scrollbar transition-opacity',
        isSearching && hasActiveFilters && 'opacity-40',
      )}>
        {/* No match-mode control: a move has exactly one type, so "all of
            these types" can only ever be empty. Several types selected always
            means any of them. */}
        {typeFilter && typeFilter.length > 0 ? (
          <>
            {typeFilter.map((type) => (
              <FilterChip
                key={type}
                label={typeLabel(type)}
                onDismiss={() => toggleType(type)}
                onClick={() => toggleSheet('type')}
                className="text-white"
                style={{ backgroundColor: TYPE_COLORS[type] }}
                testId={`tm-chip-type-${type}`}
                />
            ))}
          </>
        ) : (
          <EntryChip testId="tm-filter-type" label={t('league.type.word')} onClick={() => toggleSheet('type')} active={openSheet === 'type'} />
        )}

        {categories.length > 0 ? (
          categories.map((c) => (
            <FilterChip
              key={c}
              label={t(CATEGORY_LABEL[c])}
              onDismiss={() => toggleCategory(c)}
              onClick={() => toggleSheet('category')}
              className="text-white"
              style={{ backgroundColor: CATEGORY_COLORS[c] }}
            />
          ))
        ) : (
          <EntryChip
            testId="tm-filter-category"
            label={t('league.tm.category')}
            onClick={() => toggleSheet('category')}
            active={openSheet === 'category'}
          />
        )}

        {contests.length > 0 ? (
          contests.map((c) => (
            <FilterChip
              key={c}
              label={t(CONTEST_LABEL[c])}
              onDismiss={() => toggleContest(c)}
              onClick={() => toggleSheet('contest')}
              className="text-white"
              style={{ backgroundColor: CONTEST_COLORS[c] }}
            />
          ))
        ) : (
          <EntryChip
            testId="tm-filter-contest"
            label={t('league.tm.contest')}
            onClick={() => toggleSheet('contest')}
            active={openSheet === 'contest'}
          />
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 cursor-pointer text-[0.625rem] text-muted-foreground underline hover:text-foreground"
          >
            {t('league.tm.clear')}
          </button>
        )}
      </div>

      {/* Inline filter panel, the pane's desktop idiom on both breakpoints —
          the picker already sits in a sheet on mobile. */}
      {openSheet && (
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">
              {openSheet === 'type'
                ? t('league.type.word')
                : openSheet === 'category' ? t('league.tm.categoryTitle') : t('league.tm.contestTitle')}
            </span>
            <button
              type="button"
              onClick={() => setOpenSheet(null)}
              aria-label={t('league.close')}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          {openSheet === 'type' && (
            <div className="space-y-2">
              <div data-testid="tm-type-filter" className="mx-auto grid max-w-sm grid-cols-3 gap-1">
                {TYPE_NAMES.map((type) => {
                  const isSelected = typeFilter?.includes(type) ?? false;
                  return (
                    <button
                      type="button"
                      key={type}
                      onClick={() => toggleType(type)}
                      className="flex cursor-pointer items-center justify-center rounded-full transition-opacity duration-150 ease-out hover:ring-[3px] hover:ring-foreground/25 active:scale-[0.96]"
                      style={{ opacity: typeFilter && typeFilter.length > 0 && !isSelected ? 0.3 : 1 }}
                    >
                      <TypeBadge type={type} className="w-[5.625rem]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {openSheet === 'category' && (
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <OptionChip
                  key={c}
                  label={t(CATEGORY_LABEL[c])}
                  active={categories.includes(c)}
                  colour={CATEGORY_COLORS[c]}
                  onClick={() => toggleCategory(c)}
                />
              ))}
            </div>
          )}
          {openSheet === 'contest' && (
            <div className="flex flex-wrap gap-1.5">
              {CONTEST_TYPES.map((c) => (
                <OptionChip
                  key={c}
                  label={t(CONTEST_LABEL[c])}
                  active={contests.includes(c)}
                  colour={CONTEST_COLORS[c]}
                  onClick={() => toggleContest(c)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid items-center border-b px-3 pb-1" style={grid}>
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('league.type.word')}</span>
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{t('league.tm.col.category')}</span>
        {header('name', t('league.tm.col.move'))}
        {header('power', t('league.tm.col.power'), true)}
        {header('accuracy', t('league.tm.col.accuracy'), true)}
        {header('pp', t('league.tm.col.pp'), true)}
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {results.map((m) => (
          <button
            key={m.id}
            type="button"
            data-testid={`tm-move-${m.id}`}
            onClick={() => {
              setTm(cardIndex, m.id);
              onClose();
            }}
            className="grid h-8 w-full cursor-pointer items-center border-t border-border/50 text-left transition-colors hover:bg-foreground/[0.06]"
            style={grid}
          >
            <TypeBadge type={m.type} className="w-[4.375rem]" />
            <CategoryChip category={m.category} />
            <span data-tm-row-name="" className="line-clamp-2 text-[0.8125rem] font-medium leading-[1.1]">{nameOf(m)}</span>
            <span className="text-right text-[0.65625rem] tabular-nums">{m.power ?? '—'}</span>
            <span className="text-right text-[0.65625rem] tabular-nums">{m.accuracy !== null ? `${m.accuracy}%` : '—'}</span>
            <span className="text-right text-[0.65625rem] tabular-nums">{m.pp}</span>
          </button>
        ))}
        {results.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">{t('league.tm.empty')}</div>}
      </div>
    </div>
  );
}

export function MovePicker({ cardIndex }: { cardIndex: number }) {
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const isDesktop = useIsDesktop();
  const close = () => setMovePickerOpen(false);
  const t = useT();
  const slot = slotLabel(cardIndex);
  // One sentence with the slot in red, wherever the language puts it.
  const title = splitTemplate(raw('league.tm.title'));

  if (!isDesktop) {
    return (
      <BottomSheet
        onClose={close}
        size="full"
        topGap={49}
        closeLabel={t('league.tm.titlePlain', { slot })}
        title={
          <>
            {title.map((part, i) =>
              part.kind === 'slot' ? (
                <span key={i} className="text-primary">{slot}</span>
              ) : (
                <span key={i} className="text-foreground">{part.text}</span>
              ),
            )}
          </>
        }
      >
        <PickerBody cardIndex={cardIndex} onClose={close} />
      </BottomSheet>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative flex max-h-[80vh] w-[26rem] flex-col rounded-2xl bg-background shadow-2xl">
        <div className="flex flex-col items-center py-3">
          <span className="text-sm font-semibold">
            {title.map((part, i) =>
              part.kind === 'slot' ? <span key={i} className="text-primary">{slot}</span> : part.text,
            )}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label={t('league.close')}
            className="absolute right-3 top-3 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="border-b" />
        <PickerBody cardIndex={cardIndex} onClose={close} />
      </div>
    </div>
  );
}
