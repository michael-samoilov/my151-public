import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn, displayName } from '@/lib/utils';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW, ROW_COUNT, TEAM_SIZES, slotKind, slotLabel } from '@/league/model/constants';
import { defaultBoundaries, deriveRows, visibleMembers, type PlacedLine } from '@/league/model/engine';
import { cardShades } from '@/league/theme';
import { BossBall, Crown, GymBadges, Stars } from '@/league/components/glyphs';

/** The fields a visit board reads. Matches `LeagueCard` on AdminPage. */
interface VisitCard {
  i: number;
  t?: string;
  l: { b: number[]; bd?: number[] }[];
  aceId?: number;
  lg?: [number, number][];
}

/** Compact gym-card geometry, in rem. Sized so two rows of seven fit a
 *  1280×800 admin pane; the strip then zooms down if the pane is shorter. */
const ROW_H = 1.15;
const BAND_H = 0.9;
const PAD_X = 0.28;
const PAD_Y = 0.28;
const CARD_W = 11;
const GAP_REM = 0.35;
const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };
const BAND_BEFORE: Record<number, string> = {
  [ELITE_ROW]: 'ELITE FOUR & CHAMPION',
  [BOSS_ROW]: 'ENDGAME BOSS',
};
const CARD_H = PAD_Y * 2 + BAND_H + ROW_COUNT * ROW_H + Object.keys(BAND_BEFORE).length * BAND_H;
/** After zoom, a row shorter than this (px) is no longer a gym card. */
const MIN_ROW_PX = 14;

const CROWN_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} aria-label="Champion">
    <path d="M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6" />
  </svg>
);
const POKEBALL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" width={13} height={13} aria-label="Endgame boss">
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
        <img src={p.sprite} alt={p.name} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} loading="lazy" />
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

function RowGlyph({ row, cell }: { row: number; cell: string }) {
  if (row <= 8) return <GymBadges n={row} size={row <= 4 ? 8 : 6} />;
  if (row === ELITE_ROW) return <Stars n={4} size={7} />;
  if (row === CHAMPION_ROW) return <Crown size={11} />;
  return <BossBall cell={cell} size={12} />;
}

function MiniGymCard({ index, card }: { index: number; card: VisitCard | undefined }) {
  const shades = shadesOf(card?.t);
  const { lines, legends } = placedOf(card);
  const rows = deriveRows(lines, legends);
  const vars = { '--lg-cell': shades.cell, '--lg-band': shades.band } as CSSProperties;

  return (
    <div
      data-testid="admin-gym-card"
      data-slot={index}
      className="overflow-hidden rounded-lg"
      style={{
        ...vars,
        width: `${CARD_W}rem`,
        height: `${CARD_H}rem`,
        background: shades.base,
        padding: `${PAD_Y}rem ${PAD_X}rem`,
      }}
    >
      <div
        className="flex items-center rounded-[0.2rem] px-1 text-white"
        style={{ height: `${BAND_H}rem`, background: 'var(--lg-band)' }}
      >
        <b className="truncate text-[0.55rem] font-extrabold tracking-[0.06em]">{slotLabel(index).toUpperCase()}</b>
      </div>
      {rows.map((cells, i) => {
        const row = i + 1;
        const size = TEAM_SIZES[row - 1];
        const span = GLYPH_SPAN[row] ?? 1;
        const lead = 7 - size - span;
        const band = BAND_BEFORE[row];
        return (
          <div key={row}>
            {band && (
              <div
                className="flex items-center rounded-[0.2rem] px-1 text-white"
                style={{ height: `${BAND_H}rem`, background: 'var(--lg-band)' }}
              >
                <b className="truncate text-[0.5rem] font-extrabold tracking-[0.06em]">{band}</b>
              </div>
            )}
            <div className="grid grid-cols-7 items-center" style={{ height: `${ROW_H}rem` }}>
              {Array.from({ length: lead }, (_, k) => (
                <div key={`lead-${k}`} />
              ))}
              <div
                className={cn('mx-px flex items-center justify-center self-center rounded-[0.2rem]', span === 2 && 'col-span-2')}
                style={{ height: `${ROW_H - 0.2}rem`, background: 'var(--lg-cell)' }}
              >
                <RowGlyph row={row} cell={shades.cell} />
              </div>
              {cells.map((cell) => {
                const id = cell.pokemonId;
                return (
                  <div key={`${row}-${cell.seat}`} className="flex h-full min-h-0 items-center justify-center px-px">
                    {id !== null ? (
                      <MiniTile id={id} ace={id === card?.aceId} fill />
                    ) : (
                      <div className="h-[85%] w-full rounded-[3px] bg-white/70" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function colsThatFit(availW: number, availH: number, root: number): 14 | 7 {
  const cardW = CARD_W * root;
  const cardH = CARD_H * root;
  const gap = GAP_REM * root;
  const scale14 = Math.min(availW / (14 * cardW + 13 * gap), availH / cardH);
  return ROW_H * root * scale14 >= MIN_ROW_PX ? 14 : 7;
}

function DesktopGymStrip({ cards }: { cards: VisitCard[] }) {
  const bySlot = new Map<number, VisitCard>();
  for (const c of cards) bySlot.set(c.i, c);
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<14 | 7>(7);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const inner = innerRef.current;
    if (!host || !inner) return;
    let raf = 0;
    const apply = () => {
      inner.style.zoom = '1';
      const availW = host.clientWidth;
      const availH = host.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next = colsThatFit(availW, availH, root);
      if (next !== cols) {
        setCols(next);
        return;
      }
      const needW = inner.offsetWidth;
      const needH = inner.offsetHeight;
      if (needW <= 0 || needH <= 0) return;
      inner.style.zoom = String(Math.max(0.2, Math.min(availW / needW, availH / needH, 1)));
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [cols, cards]);

  return (
    <div
      ref={hostRef}
      data-testid="league-visit-board"
      data-cols={cols}
      className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
    >
      <div
        ref={innerRef}
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${CARD_W}rem)`,
          gap: `${GAP_REM}rem`,
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
        className="flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-border px-[7px] opacity-55"
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
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border px-[5px] py-[3px]"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
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
                <MiniTile id={id} ace={id === card.aceId} fill />
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
      className="grid h-full min-h-0 w-full flex-1 gap-1"
      style={{
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
      }}
    >
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="min-h-0" style={slotCellStyle(i)}>
          <MobileSlot i={i} card={bySlot.get(i)} />
        </div>
      ))}
    </div>
  );
}

/** The league at one moment: full gym cards on desktop, a 3×4 + 2 compact
 *  board on a phone. Both fill the pane they sit in. */
export function LeagueVisitBoard({ cards }: { cards: VisitCard[] }) {
  const desktop = useIsDesktop();
  if (desktop) return <DesktopGymStrip cards={cards} />;
  return <MobileLeagueBoard cards={cards} />;
}
