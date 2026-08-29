import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { typeLabel } from '@/i18n';
import { cn } from '@/lib/utils';
import type { TypeName } from '@/types/pokemon';
import { slotLabel } from '../model/constants';
import { TYPE_COLORS } from '@/data/type-colors';
import { CATEGORY_COLORS, CONTEST_TYPES, MOVES, type ContestType, type Move } from '../moves';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * The TM picker: the selection pane's idiom (search, chip row, dense
 * results) over the moves dataset. Fields run Type, Cat., Move, PP, Att.,
 * Acc.; Move and the numeric columns sort, and a move that always hits
 * carries no accuracy and sorts above 100%.
 */

type SortKey = 'name' | 'pp' | 'power' | 'accuracy';

const CATEGORY_CYCLE = [null, 'physical', 'special', 'status'] as const;

function CategoryChip({ category }: { category: Move['category'] }) {
  return (
    <span
      className="flex h-[1.4rem] w-[1.875rem] shrink-0 items-center justify-center rounded-md border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ background: CATEGORY_COLORS[category] }}
      title={category}
    >
      <img src={`/sprites/moves/${category}.png`} alt={category} className="h-[0.75rem] w-[0.9375rem]" />
    </span>
  );
}

function SortCaret({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <svg viewBox="0 0 12 12" className={cn('mr-[2px] h-[9px] w-[9px]', dir === 'desc' && 'rotate-180')}>
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

export function MovePicker({ cardIndex }: { cardIndex: number }) {
  const setTm = useLeagueStore((s) => s.setTm);
  const cardType = useLeagueStore((s) => s.cards[cardIndex]?.type ?? null);
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeName | null>(cardType);
  const [category, setCategory] = useState<Move['category'] | null>(null);
  const [contest, setContest] = useState<ContestType | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = MOVES.filter(
      (m) =>
        (!typeFilter || m.type === typeFilter) &&
        (!category || m.category === category) &&
        (!contest || m.contest === contest) &&
        (!q || m.name.toLowerCase().includes(q)),
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    const num = (v: number | null) => (v === null ? 101 : v); // always-hits above 100%
    filtered.sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
      if (sortKey === 'pp') return dir * (a.pp - b.pp) || a.name.localeCompare(b.name);
      if (sortKey === 'power') return dir * ((a.power ?? -1) - (b.power ?? -1)) || a.name.localeCompare(b.name);
      return dir * (num(a.accuracy) - num(b.accuracy)) || a.name.localeCompare(b.name);
    });
    return filtered;
  }, [search, typeFilter, category, contest, sortKey, sortDir]);

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
        'flex items-center text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
        right && 'justify-end',
      )}
    >
      {right && <SortCaret dir={sortKey === key ? sortDir : null} />}
      {label}
      {!right && <SortCaret dir={sortKey === key ? sortDir : null} />}
    </button>
  );

  const chip = (active: boolean, label: string, onClick: () => void, colour?: string) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        active ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:text-foreground',
      )}
      style={active ? { background: colour ?? '#0a0a0a' } : undefined}
    >
      {label}
      {active && <X size={10} />}
    </button>
  );

  const grid = { gridTemplateColumns: '4.5rem 2.125rem 1fr 1.5rem 1.875rem 2.375rem', columnGap: '0.375rem' };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setMovePickerOpen(false)} />
      <div className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-background shadow-2xl md:max-h-[80vh] md:w-[26rem] md:rounded-2xl">
        <div className="flex flex-col items-center py-3">
          <span className="mb-1 h-1 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
          <span className="text-sm font-semibold">
            TM for: <span className="text-primary">{slotLabel(cardIndex)}</span>
          </span>
          <button
            type="button"
            onClick={() => setMovePickerOpen(false)}
            className="absolute right-3 top-3 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="border-b" />
        <div className="flex items-center gap-2 p-3 pb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search moves" className="pl-9" />
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{results.length} found</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2 no-scrollbar">
          {chip(!!typeFilter, typeFilter ? typeLabel(typeFilter) : 'Type', () => setTypeFilter(typeFilter ? null : cardType), typeFilter ? TYPE_COLORS[typeFilter] : undefined)}
          {chip(!!category, category ? category[0].toUpperCase() + category.slice(1) : 'Category', () => {
            const i = CATEGORY_CYCLE.indexOf(category);
            setCategory(CATEGORY_CYCLE[(i + 1) % CATEGORY_CYCLE.length]);
          }, category ? CATEGORY_COLORS[category] : undefined)}
          {chip(!!contest, contest ? contest[0].toUpperCase() + contest.slice(1) : 'Contest', () => {
            const order: (ContestType | null)[] = [null, ...CONTEST_TYPES];
            const i = order.indexOf(contest);
            setContest(order[(i + 1) % order.length]);
          })}
        </div>
        <div className="grid items-center border-b px-3 pb-1" style={grid}>
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Type</span>
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Cat.</span>
          {header('name', 'Move')}
          {header('pp', 'PP', true)}
          {header('power', 'Att.', true)}
          {header('accuracy', 'Acc.', true)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setTm(cardIndex, m.id);
                setMovePickerOpen(false);
              }}
              className="grid h-8 w-full cursor-pointer items-center border-t border-border/50 text-left hover:bg-secondary/60"
              style={grid}
            >
              <TypeBadge type={m.type} className="w-[4.375rem]" />
              <CategoryChip category={m.category} />
              <span className="truncate text-[0.8125rem] font-medium">{m.name}</span>
              <span className="text-right text-[0.65625rem] tabular-nums">{m.pp}</span>
              <span className="text-right text-[0.65625rem] tabular-nums">{m.power ?? '—'}</span>
              <span className="text-right text-[0.65625rem] tabular-nums">{m.accuracy !== null ? `${m.accuracy}%` : '—'}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">No moves match.</div>
          )}
        </div>
      </div>
    </div>
  );
}
