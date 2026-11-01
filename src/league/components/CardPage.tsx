import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Pencil, Plus, X } from 'lucide-react';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { localeUppercase, typeLabel, typeLabels, useT } from '@/i18n';
import { typeIconPath } from '@/data/type-ids';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_BADGE, TYPE_BADGE_H, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { cn } from '@/lib/utils';
import { slotLabel } from '../slotLabel';
import { useLeagueStore, type CardType } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { NO_TYPE_STAR_RADIUS } from '../theme';
import { useCardView } from '../useCardView';
import { usePickerPreload } from '../pickerPreload';
import { fitStyle, useFitScale } from '../useFitScale';
import { SPRITE_REM } from '../slotLayout';
import { spriteRendering, spriteScreen } from '../spriteScale';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { useDevicePixelRatio } from '@/lib/usePixelPerfectSprite';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { CardGrid } from './CardGrid';
import { CardHelpButton } from './CardHelp';
import { HEADER_FIELD_H, LeagueExportButton } from './HeaderActions';
import { LeagueTipSlot } from './LeagueFunnelNudge';
import { usePencilRoom } from './usePencilRoom';
import { MovePicker } from './MovePicker';
import { confirmOnEnter } from './confirmOnEnter';

const NO_TYPE_BADGE_WIDE_W = 621;

function NoTypeBadge({ className }: { className?: string }) {
  const t = useT();
  const label = localeUppercase(t('league.type.none'));
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  const glyph = typeBadgeGlyphBox();
  const w = NO_TYPE_BADGE_WIDE_W;
  const cx = w / 2;
  return (
    <svg
      viewBox={`0 0 ${w} ${TYPE_BADGE_H}`}
      className={cn('h-auto w-full', className)}
      role="img"
      aria-label={t('league.type.none')}
    >
      <rect width={w} height={TYPE_BADGE_H} rx={TYPE_BADGE.radius} fill="#9CA3AF" />
      <path
        d={starPath(glyph.x + glyph.size / 2, glyph.y + glyph.size / 2, glyph.size / 2)}
        fill="#ffffff"
      />
      <g transform={`translate(${cx} 0) scale(${fit.scaleX} 1) translate(${-cx} 0)`}>
        <text
          x={cx}
          y={fit.baseline}
          textAnchor="middle"
          fontSize={fit.fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#ffffff"
        >
          {label}
        </text>
      </g>
    </svg>
  );
}

const TYPE_MARK = '1.875rem';
const TYPE_MARK_RADIUS = '0.4375rem';

function UnsetTypeMark() {
  const t = useT();
  return (
    <span
      className="flex flex-col items-center justify-center gap-[0.09375rem] bg-primary text-primary-foreground"
      style={{ width: TYPE_MARK, height: TYPE_MARK, borderRadius: TYPE_MARK_RADIUS }}
    >
      <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
      <span className="text-[0.40625rem] font-extrabold leading-[1.1] tracking-[0.06em]">{localeUppercase(t('league.type.word'))}</span>
    </span>
  );
}

function NoTypeMark() {
  return (
    <span
      className="block"
      style={{
        width: TYPE_MARK, height: TYPE_MARK,
        borderRadius: TYPE_MARK_RADIUS, background: '#9CA3AF',
      }}
    >
      <svg viewBox="0 0 22 22" className="block h-full w-full" aria-hidden>
        <path d={starPath(11, 11, 22 * NO_TYPE_STAR_RADIUS)} fill="#ffffff" />
      </svg>
    </span>
  );
}

function TypeMark({ type }: { type: CardType }) {
  if (type === null) return <UnsetTypeMark />;
  if (type === 'none') return <NoTypeMark />;
  return (
    <img
      src={typeIconPath(type as TypeName)}
      alt=""
      className="block"
      style={{ width: TYPE_MARK, height: TYPE_MARK, borderRadius: TYPE_MARK_RADIUS }}
    />
  );
}

function TypePicker({ cardIndex }: { cardIndex: number }) {
  const setCardType = useLeagueStore((s) => s.setCardType);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const t = useT();
  const pick = (type: CardType) => {
    setCardType(cardIndex, type);
    setTypePickerOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setTypePickerOpen(false)} />
      <div className="relative rounded-t-2xl bg-background p-4 shadow-2xl md:w-[24rem] md:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">{t('league.type.label')}</span>
          <button
            type="button"
            onClick={() => setTypePickerOpen(false)}
            aria-label={t('league.close')}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TYPE_NAMES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => pick(type)}
              className="cursor-pointer rounded-full hover:ring-[3px] hover:ring-foreground/25"
            >
              <TypeBadge type={type} className="w-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick('none')}
            className="col-span-3 cursor-pointer rounded-full hover:ring-[3px] hover:ring-foreground/25"
          >
            <NoTypeBadge />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CardIdentity({ cardIndex, showBack }: { cardIndex: number; showBack: boolean }) {
  const view = useCardView(cardIndex);
  const setCardTheme = useLeagueStore((s) => s.setCardTheme);
  const closeCardPage = useLeagueUi((s) => s.closeCardPage);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const t = useT();
  const typeButtonLabel = view.card.type === null
    ? t('league.type.label')
    : view.card.type === 'none'
      ? t('league.type.labelNone')
      : t('league.type.labelNamed', { type: typeLabel(view.card.type) });
  const themePlaceholder = t('league.card.themePlaceholder');
  const blockRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const pencilRoom = usePencilRoom(blockRef, ghostRef, view.card.theme);
  return (
    <>
      {showBack && (
        <button
          type="button"
          onClick={closeCardPage}
          aria-label={t('league.card.back', { slot: slotLabel(cardIndex) })}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <button
        type="button"
        onClick={() => setTypePickerOpen(true)}
        aria-label={typeButtonLabel}
        className="shrink-0 cursor-pointer rounded-[0.4375rem] hover:ring-[3px] hover:ring-foreground/25"
      >
        <TypeMark type={view.card.type} />
      </button>
      <div ref={blockRef} className="flex min-w-0 flex-1 flex-col justify-center gap-[0.0625rem]">
        <h2 className="truncate text-[0.6875rem] font-semibold leading-none text-muted-foreground">
          {t('league.card.title')}
        </h2>
        <label className="group flex min-w-0 max-w-full cursor-text items-center gap-1 overflow-hidden">
          <span
            className="grid min-w-0 items-center overflow-hidden border-b border-dashed border-foreground/25 transition-colors [grid-template-columns:minmax(0,max-content)] group-hover:border-foreground/50 group-focus-within:border-foreground/60"
            style={{ height: HEADER_FIELD_H }}
          >
            <span
              ref={ghostRef}
              aria-hidden
              className={cn(
                'invisible col-start-1 row-start-1 whitespace-pre text-[0.875rem] leading-tight',
                view.card.theme ? 'font-bold' : 'font-normal',
              )}
            >
              {view.card.theme || themePlaceholder}
            </span>
            <input
              value={view.card.theme}
              onChange={(e) => setCardTheme(cardIndex, e.target.value)}
              placeholder={themePlaceholder}
              aria-label={t('league.card.themeLabel')}
              enterKeyHint="done"
              onKeyDown={confirmOnEnter}
              // The words are clipped at the field's own box, and a clip
              // lands mid-glyph — which reads as the name running under
              // whatever sits next in the bar rather than ending. An
              // ellipsis says it ends. Browsers draw it only while the
              // field is not focused, which is the behaviour to want: once
              // you are typing you need to see the caret's end of the text,
              // not a mark saying there is more.
              //
              // Only the drawing is cut. `value` is the whole name, and the
              // store keeps it — the export renders from the store.
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-[0.875rem] font-bold leading-tight text-ellipsis outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </span>
          {pencilRoom && (
            <Pencil size={11} className="shrink-0 text-primary" aria-hidden />
          )}
        </label>
      </div>
    </>
  );
}

export function CardActions({ cardIndex }: { cardIndex: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <CardHelpButton />
      <LeagueExportButton cardIndex={cardIndex} />
    </span>
  );
}

export function CardPage({ cardIndex, showBack, withBar = true }: {
  cardIndex: number;
  showBack: boolean;
  withBar?: boolean;
}) {
  const view = useCardView(cardIndex);
  usePickerPreload(cardIndex);
  const typePickerOpen = useLeagueUi((s) => s.typePickerOpen);
  const movePickerOpen = useLeagueUi((s) => s.movePickerOpen);
  const fitRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const dpr = useDevicePixelRatio();
  const fit = useFitScale(
    fitRef,
    0.55,
    isDesktop && !withBar ? { baseWidthRem: 26, spriteRem: SPRITE_REM, targetSpritePx: 96, dpr, tail: true } : undefined,
  );
  const rendering = spriteRendering(
    spriteScreen(isDesktop, dpr),
    SPRITE_REM * getAppliedRootFontSizePx() * fit.scale,
    dpr,
  );

  return (
    <div className="w-full">
      {withBar && (
        <div
          data-testid="league-tool-bar"
          className={cn('flex h-11 items-center gap-2 px-3', showBack && 'border-b bg-card')}
        >
          <CardIdentity cardIndex={cardIndex} showBack={showBack} />
          <CardActions cardIndex={cardIndex} />
        </div>
      )}
      {withBar && <LeagueTipSlot pane="card" />}
      <div className="px-3 pt-2.5">
        <div ref={fitRef} style={fitStyle(fit, rendering)}>
          <CardGrid cardIndex={cardIndex} view={view} hints={isDesktop && !withBar ? (fit.tail ? 'tight' : 'off') : 'loose'} />
        </div>
      </div>
      {/* Both pickers are `position: fixed`, and a transformed ancestor
          becomes the containing block for fixed descendants. Mobile puts the
          card inside a translated two-pane track, which anchored them to the
          200%-wide track instead of the viewport — the type picker spanned
          both panes. A portal takes them out of the tree entirely, so no
          ancestor can move them again. React context still reaches them. */}
      {typePickerOpen && createPortal(<TypePicker cardIndex={cardIndex} />, document.body)}
      {movePickerOpen && createPortal(<MovePicker cardIndex={cardIndex} />, document.body)}
    </div>
  );
}
