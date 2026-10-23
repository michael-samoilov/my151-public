import { Check, Download, X } from 'lucide-react';
import { PokeBallSpinner } from '@/components/shared/PokeBallSpinner';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { useT, type NoArgKey } from '@/i18n';
import { ExportSettingsScroll } from '@/components/export/ExportSettingsScroll';
import type { CardTeamOrder, LeagueHomeExportLayout, LeagueHomeTeamMode } from '../export/exportOptions';

const TEAM_OPTIONS: { mode: LeagueHomeTeamMode; label: NoArgKey; fill: 'left' | 'right' | 'both' }[] = [
  { mode: 'story', label: 'leagueExport.team.story', fill: 'left' },
  { mode: 'rematch', label: 'leagueExport.team.rematch', fill: 'right' },
  { mode: 'both', label: 'leagueExport.team.both', fill: 'both' },
];

const DETAIL_OPTIONS: {
  key: 'showLeagueName' | 'showTheme' | 'showTmReward' | 'showBadgeName';
  title: NoArgKey;
}[] = [
  { key: 'showLeagueName', title: 'leagueExport.detail.leagueName' },
  { key: 'showTheme', title: 'leagueExport.detail.theme' },
  { key: 'showTmReward', title: 'leagueExport.detail.tmReward' },
  { key: 'showBadgeName', title: 'leagueExport.detail.badgeName' },
];

export function LeagueExportSettingsPane({
  isLeague,
  layout,
  onLayout,
  cardTeamOrder,
  onCardTeamOrder,
  busy,
  onExport,
  failed = false,
  onClose,
  mobileSheet = false,
}: {
  isLeague: boolean;
  layout: LeagueHomeExportLayout;
  onLayout: (next: LeagueHomeExportLayout) => void;
  cardTeamOrder: CardTeamOrder;
  onCardTeamOrder: (next: CardTeamOrder) => void;
  busy: boolean;
  onExport: () => void;
  failed?: boolean;
  onClose: () => void;
  mobileSheet?: boolean;
}) {
  const t = useT();
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      {!mobileSheet && (
        <div className="shrink-0 border-b">
          <div className="flex h-11 items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">{t('export.title')}</span>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('export.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isLeague ? (
        <ExportSettingsScroll>
          <div className={mobileSheet ? 'space-y-2 px-3 pb-2 pt-1' : 'space-y-4 px-3 pb-2 pt-3'}>
            <div>
              <h3 className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('leagueExport.details')}
              </h3>
              <div className={mobileSheet ? 'grid grid-cols-2 gap-1' : 'space-y-1'}>
                {DETAIL_OPTIONS.map(({ key, title }) => (
                  <LayoutToggle
                    key={key}
                    on={layout[key]}
                    id={key}
                    title={t(title)}
                    compact={mobileSheet}
                    onClick={() => onLayout({ ...layout, [key]: !layout[key] })}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('leagueExport.teams')}
              </h3>
              <div className="grid grid-cols-3 gap-1">
                {TEAM_OPTIONS.map(({ mode, label, fill }) => (
                  <TeamModeOption
                    key={mode}
                    selected={layout.teamMode === mode}
                    label={t(label)}
                    fill={fill}
                    onClick={() => onLayout({ ...layout, teamMode: mode })}
                  />
                ))}
              </div>
            </div>
          </div>
        </ExportSettingsScroll>
      ) : (
        <div className={mobileSheet ? 'px-3 pb-2 pt-1' : 'min-h-0 flex-1 px-3 pb-2 pt-3'}>
          <h3 className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('leagueExport.teamOrder')}
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {(['fixed', 'first-last'] as const).map((order) => (
              <button
                key={order}
                type="button"
                onClick={() => onCardTeamOrder(order)}
                data-export-card-order={order}
                aria-pressed={cardTeamOrder === order}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[0.6875rem] leading-tight transition-colors ${
                  cardTeamOrder === order ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
                }`}
              >
                <CardOrderGlyph order={order} />
                {t(order === 'fixed' ? 'leagueExport.order.fixed' : 'leagueExport.order.firstLast')}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(cardTeamOrder === 'fixed' ? 'leagueExport.order.fixedHint' : 'leagueExport.order.firstLastHint')}
          </p>
        </div>
      )}

      <div className={`flex shrink-0 flex-col gap-2 border-t pt-2 ${mobileSheet ? 'px-3 pb-3' : 'px-4 pb-4'}`}>
        {failed && <p role="alert" className="text-sm text-destructive">{t('favorites.export.error')}</p>}
        <Button type="button" disabled={busy} onClick={onExport} data-league-export-confirm>
          {busy ? (
            <>
              <PokeBallSpinner tone="line" className="mr-2 size-4" />
              {t('export.preparing')}
            </>
          ) : (
            <>
              <Download className="mr-2 size-4" />
              {t('export.save')}
            </>
          )}
        </Button>
        {!mobileSheet && (
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('export.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}

function LayoutToggle({
  on,
  id,
  title,
  onClick,
  compact = false,
}: {
  on: boolean;
  id: string;
  title: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-export-detail={id}
      className={`w-full cursor-pointer rounded-md text-left transition-colors ${
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      } ${on ? 'bg-primary/10' : 'hover:bg-muted'}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            on ? 'border-primary bg-primary' : 'border-muted-foreground/40'
          }`}
        >
          {on && <Check className="h-3 w-3 text-primary-foreground" />}
        </span>
        <span className={`text-sm leading-tight ${on ? 'font-medium text-primary' : 'text-foreground'}`}>
          {title}
        </span>
      </div>
    </button>
  );
}

function TeamModeGlyph({ fill }: { fill: 'left' | 'right' | 'both' }) {
  const left = fill === 'left' || fill === 'both';
  const right = fill === 'right' || fill === 'both';
  return (
    <svg viewBox="0 0 32 20" className="h-4 w-7" aria-hidden>
      <rect
        x="1.25"
        y="1.25"
        width="13.5"
        height="17.5"
        rx="2"
        fill={left ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="17.25"
        y="1.25"
        width="13.5"
        height="17.5"
        rx="2"
        fill={right ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TeamModeOption({
  selected,
  label,
  fill,
  onClick,
}: {
  selected: boolean;
  label: string;
  fill: 'left' | 'right' | 'both';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-export-team={fill === 'both' ? 'both' : fill === 'left' ? 'story' : 'rematch'}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 py-2 text-center text-[0.6875rem] leading-tight transition-colors ${
        selected ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
      }`}
    >
      <TeamModeGlyph fill={fill} />
      {label}
    </button>
  );
}

function CardOrderGlyph({ order }: { order: CardTeamOrder }) {
  const clipId = useId();
  const columns = order === 'fixed'
    ? [[null,null,0], [null,1,1], [2,2,2], [3,3,3]]
    : [[null,null,2], [null,2,1], [2,1,0], [3,3,3]];
  const shapes = columns.map(orderLineContour);
  return (
    <svg viewBox="0 0 109 109" className="h-7 w-7" fill="none" strokeWidth={327 / 35} aria-hidden data-card-order-glyph={order}>
      <defs>
        {shapes.map((points, line) => (
          <clipPath key={line} id={`${clipId}-${line}`}>
            <path d={roundedOrderPath(points)} fill="black" stroke="none" />
          </clipPath>
        ))}
      </defs>
      {shapes.map((points, line) => (
        <path
          key={line}
          d={roundedOrderPath(points)}
          clipPath={`url(#${clipId}-${line})`}
          stroke="currentColor"
          strokeOpacity={[0.45, 0.63, 0.81, 1][line]}
        />
      ))}
    </svg>
  );
}

function orderLineContour(columns: (number | null)[]): number[][] {
  const spans: { left: number; right: number; top: number; bottom: number }[] = [];
  columns.forEach((column, row) => {
    if (column === null) return;
    const left = 2 + column * 27;
    const previous = spans[spans.length - 1];
    if (previous?.left === left) previous.bottom = row * 36 + 35;
    else spans.push({ left, right: left + 24, top: 2 + row * 36, bottom: row * 36 + 35 });
  });
  const points = [[spans[0].left, spans[0].top], [spans[0].right, spans[0].top]];
  spans.forEach((span, i) => {
    points.push([span.right, span.bottom]);
    if (spans[i + 1]) points.push([spans[i + 1].right, span.bottom]);
  });
  points.push([spans[spans.length - 1].left, spans[spans.length - 1].bottom]);
  for (let i = spans.length - 1; i > 0; i--) {
    points.push([spans[i].left, spans[i].top], [spans[i - 1].left, spans[i].top]);
  }
  return points;
}

function roundedOrderPath(points: number[][]): string {
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i - 1 + points.length) % points.length];
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const incoming = [current[0] - previous[0], current[1] - previous[1]];
    const outgoing = [next[0] - current[0], next[1] - current[1]];
    const before = Math.hypot(...incoming);
    const after = Math.hypot(...outgoing);
    const concave = incoming[0] * outgoing[1] - incoming[1] * outgoing[0] < 0;
    const radius = Math.min(8 + (concave ? 3 : 0), before / 2, after / 2);
    const start = current.map((value, axis) => value - incoming[axis] * radius / before);
    const end = current.map((value, axis) => value + outgoing[axis] * radius / after);
    parts.push(`${i === 0 ? 'M' : 'L'} ${start.join(' ')}`, `Q ${current.join(' ')} ${end.join(' ')}`);
  }
  return `${parts.join(' ')} Z`;
}
