import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn, displayName } from '@/lib/utils';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { ROW_COUNT, slotKind } from '@/league/model/constants';
import { defaultBoundaries, deriveRows, visibleMembers, type PlacedLine } from '@/league/model/engine';
import { cardShades } from '@/league/theme';

/** The fields a visit board reads. Matches `LeagueCard` on AdminPage. */
interface VisitCard {
  i: number;
  t?: string;
  l: { b: number[]; bd?: number[] }[];
  aceId?: number;
  lg?: [number, number][];
}

/** 14-across only when each card is wide enough that a row still reads. */
const MIN_CARD_W = 90;
const MIN_ROW_PX = 12;

const CROWN_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12} aria-label="Champion">
    <path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6" />
  </svg>
);
const POKEBALL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={12} height={12} aria-label="Endgame boss">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h6M15 12h6" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
  </svg>
);

function slotBadge(i: number): ReactNode {
  const kind = slotKind(i);
  if (kind === 'champion') return CROWN_SVG;
  if (kind === 'boss') return POKEBALL_SVG;
  if (kind === 'elite') return `E${i - 7}`;
  return `G${i + 1}`;
}

function slotAbbr(i: number): string {
  const kind = slotKind(i);
  if (kind === 'champion') return 'CH';
  if (kind === 'boss') return 'BOSS';
  if (kind === 'elite') return `E${i - 7}`;
  return `G${i + 1}`;
}

const typeColorOf = (t?: string) => (t && (TYPE_COLORS as Record<string, string>)[t]) || 'var(--color-sink)';
const isTypeName = (t?: string): t is TypeName => !!t && t in TYPE_COLORS;

function TypeMark({ t }: { t?: string }) {
  if (t === 'none') {
    return (
      <svg viewBox="0 0 22 22" className="aspect-square w-full rounded-[3px]" aria-label="No type" role="img">
        <rect width="22" height="22" rx="5" fill="#9CA3AF" />
        <path d={starPath(11, 11, 7)} fill="#ffffff" />
      </svg>
    );
  }
  if (isTypeName(t)) {
    return <img src={typeIconPath(t)} alt={t} title={t} className="aspect-square w-full rounded-[3px]" style={{ imageRendering: 'auto' }} />;
  }
  return <div className="aspect-square w-full rounded-[3px]" style={{ background: typeColorOf(t) }} title={t ?? 'untyped'} />;
}

function MiniTile({ id, ace, fill }: { id: number; ace?: boolean; fill?: boolean }) {
  const p = getPokemonById(id);
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-[3px] bg-card',
        fill ? 'h-full w-full min-h-0' : 'aspect-square w-full',
      )}
      title={p ? `#${id} ${displayName(p.name)}${ace ? ' · ace' : ''}` : `#${id}`}
      style={ace ? { boxShadow: '0 0 0 2px var(--color-primary)', background: 'rgba(220,38,38,0.10)' } : undefined}
    >
      {p ? (
        <img src={p.sprite} alt={p.name} className="max-h-full max-w-full object-contain" style={{ imageRendering: 'pixelated' }} loading="lazy" />
      ) : (
        <span className="text-[0.45rem] text-muted-foreground">#{id}</span>
      )}
    </div>
  );
}

function placedOf(card: VisitCard | undefined): { lines: PlacedLine[]; legends: { seat: number; pokemonId: number }[] } {
  if (!card) return { lines: [], legends: [] };
  return {
    lines: card.l.map((line) => ({
      branch: line.b,
      boundaries: line.bd && line.bd.length === line.b.length ? line.bd : defaultBoundaries(line.b),
    })),
    legends: (card.lg ?? []).map(([seat, pokemonId]) => ({ seat, pokemonId })),
  };
}

function shadesOf(t?: string) {
  if (t === 'none') return cardShades('none');
  if (isTypeName(t)) return cardShades(t);
  return cardShades(null);
}

function MiniGymCard({ index, card }: { index: number; card: VisitCard | undefined }) {
  const shades = shadesOf(card?.t);
  const { lines, legends } = placedOf(card);
  const rows = deriveRows(lines, legends);

  return (
    <div
      data-testid="admin-gym-card"
      data-slot={index}
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg p-0.5"
      style={{ background: shades.base }}
    >
      <div className="absolute right-0.5 top-0.5 z-10 flex items-center gap-px rounded bg-black/25 p-px text-white">
        <div className="size-3.5 shrink-0">
          <TypeMark t={card?.t} />
        </div>
        <div className="flex size-3.5 items-center justify-center text-[0.55rem] font-extrabold leading-none">
          {slotBadge(index)}
        </div>
      </div>
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${ROW_COUNT}, minmax(0, 1fr))`,
          gap: 1,
        }}
      >
        {rows.map((cells, i) => {
          const row = i + 1;
          return cells.map((cell, col) => {
            if (cell.pokemonId === null) return null;
            return (
              <div
                key={`${row}-${cell.seat}`}
                data-row={row}
                className="min-h-0"
                style={{ gridColumn: col + 1, gridRow: row }}
              >
                <MiniTile id={cell.pokemonId} ace={cell.pokemonId === card?.aceId} fill />
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

function colsThatFit(availW: number, availH: number): 14 | 7 {
  const gap = 6;
  const cardW = (availW - 13 * gap) / 14;
  const rowPx = availH / ROW_COUNT;
  return cardW >= MIN_CARD_W && rowPx >= MIN_ROW_PX ? 14 : 7;
}

function DesktopGymStrip({ cards }: { cards: VisitCard[] }) {
  const bySlot = new Map<number, VisitCard>();
  for (const c of cards) bySlot.set(c.i, c);
  const hostRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<14 | 7>(7);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const apply = () => {
      if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
      const next = colsThatFit(host.clientWidth, host.clientHeight);
      setCols((cur) => (cur === next ? cur : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [cards]);

  return (
    <div
      ref={hostRef}
      data-testid="league-visit-board"
      data-cols={cols}
      className="h-full min-h-0 w-full flex-1 overflow-hidden"
    >
      <div
        className="grid h-full min-h-0 w-full"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: cols === 14 ? '1fr' : '1fr 1fr',
          gap: '0.35rem',
        }}
      >
        {Array.from({ length: 14 }, (_, i) => (
          <MiniGymCard key={i} index={i} card={bySlot.get(i)} />
        ))}
      </div>
    </div>
  );
}

function MobileSlot({ i, card }: { i: number; card: VisitCard | undefined }) {
  const ROWS = 3;
  const SEATS = 6;
  if (!card || card.l.length === 0) {
    return (
      <div
        data-testid={`admin-slot-${i}`}
        className="flex flex-col items-center justify-center rounded-lg border border-border px-[7px] py-2 opacity-55"
        style={{ borderLeftWidth: 3, borderLeftColor: 'var(--color-border)' }}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] font-extrabold text-muted-foreground">{slotAbbr(i)}</span>
          <span className="text-[10px] font-semibold text-muted-foreground/70">empty</span>
        </div>
      </div>
    );
  }
  const color = typeColorOf(card.t);
  return (
    <div
      data-testid={`admin-slot-${i}`}
      className="flex flex-col overflow-hidden rounded-lg border border-border px-[5px] py-[3px]"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${ROWS}, auto)`,
          gap: '1px',
        }}
      >
        <div style={{ gridColumn: 1, gridRow: 1 }} className="flex items-center justify-center text-[8px] font-extrabold text-muted-foreground">
          {slotBadge(i)}
        </div>
        <div style={{ gridColumn: 2, gridRow: 1 }} className="min-h-0">
          <TypeMark t={card.t} />
        </div>
        {Array.from({ length: SEATS }, (_, col) => {
          const seat = SEATS - col;
          const line = card.l[seat - 1];
          if (!line) return null;
          const placed = {
            branch: line.b,
            boundaries: line.bd && line.bd.length === line.b.length ? line.bd : defaultBoundaries(line.b),
          };
          const members = visibleMembers(placed, seat).slice(-ROWS);
          const gridCol = col + 1;
          return members.map((id, stage) => {
            const gridRow = ROWS - members.length + stage + 1;
            if (gridRow === 1 && gridCol <= 2) return null;
            return (
              <div key={`${seat}-${id}-${stage}`} className="min-h-0" style={{ gridColumn: gridCol, gridRow }}>
                <MiniTile id={id} ace={id === card.aceId} />
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

function slotCellStyle(i: number): CSSProperties {
  if (i < 12) {
    return {
      gridColumn: `${Math.floor(i / 4) * 2 + 1} / span 2`,
      gridRow: (i % 4) + 1,
    };
  }
  return {
    gridColumn: i === 12 ? '1 / span 3' : '4 / span 3',
    gridRow: 5,
  };
}

function MobileLeagueBoard({ cards }: { cards: VisitCard[] }) {
  const bySlot = new Map<number, VisitCard>();
  for (const c of cards) bySlot.set(c.i, c);
  return (
    <div
      data-testid="league-visit-board"
      className="grid w-full gap-1"
      style={{
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(5, auto)',
      }}
    >
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} style={slotCellStyle(i)}>
          <MobileSlot i={i} card={bySlot.get(i)} />
        </div>
      ))}
    </div>
  );
}

/** The league at one moment: Pokémon-only gym cards on desktop, a compact
 *  3×4 + 2 board on a phone. Cards keep their own height. */
export function LeagueVisitBoard({ cards }: { cards: VisitCard[] }) {
  const desktop = useIsDesktop();
  if (desktop) return <DesktopGymStrip cards={cards} />;
  return <MobileLeagueBoard cards={cards} />;
}
