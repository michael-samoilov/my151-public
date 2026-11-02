import { localeUppercase, raw, t, type NoArgKey } from '@/i18n';
import { splitTemplate } from '@/lib/richTemplate';
import { headingTracks } from '../slotHeadings';
import { EXPORT_CORNER_RATIO, EXPORT_FRAME_PX } from '@/lib/exportPngShape';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { soloSprite } from '../slotLayout';
import { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT } from '../model/constants';

export const K = 96 / 52;

const BOX_W = 864;

export const FOOT = 36;

export const CREDIT_PX = 14;
export const cardCreditPrefix = (): string => t('league.export.cardCredit');
export const homeCreditPrefix = (): string => t('league.export.homeCredit');

export function labelTrack(track: number): number {
  return headingTracks() ? track : 0;
}

// platform: A canvas sprite drawn from a half pixel resamples one device pixel off the browser's placement, so cell centres land on whole pixels.
export const PADX = 15.5;
export const COL = (BOX_W - 2 * PADX) / 7;
export const ROW = 100;
export const BAND = 37;
export const INY = 11;
export const INX = 5.5;

export const RAIL = 3 * K;

export const CELL_R = 11;
export const BAND_R = 9;
export const SLOT_R = 15;

export const CARD_W = BOX_W;

export const cardTitle = (): string => t('league.card.title');
export function specialistRuns(): { before: string; after: string } {
  const parts = splitTemplate(raw('league.export.specialist'));
  const at = parts.findIndex((p) => p.kind === 'slot');
  const text = (from: number, to: number) =>
    parts.slice(from, to).map((p) => (p.kind === 'literal' ? p.text : '')).join('').trim();
  if (at < 0) return { before: '', after: text(0, parts.length) };
  return { before: text(0, at), after: text(at + 1, parts.length) };
}
export const TITLE_SEP = '·';
export const TITLE_PX = 15 * K;
export const TITLE_TRACK = -0.01 * TITLE_PX;
const TITLE_ROW_H = 34;
export const TITLE_GAP = 14;
export const TITLE_WORD_GAP = 8;
export const TITLE_BADGE_W = 5 * 16 * K;
export const TITLE_BADGE_H = TITLE_BADGE_W / TYPE_BADGE_ASPECT;

export const THEME_LABEL_PX = 10.5 * K;
export const THEME_TEXT_PX = 13 * K;
export const THEME_GAP = 14;
export const FIELD_H = 40;
export const FIELD_R = 10;
export const FIELD_PADX = 12;
export const LABEL_GAP = 8;
const HDR_GAP = 16;

const BAR_PADY = 20;
export const BAR_H = TITLE_ROW_H + 2 * BAR_PADY;
export const BAR_TEXT_X = PADX + RAIL;
export const BAR_RING = 2;
export const TITLE_BLOCK_H = BAR_H + THEME_GAP + FIELD_H + HDR_GAP;

export const FRAME = EXPORT_FRAME_PX;

export function markWord(key: 'league.tm.mark' | 'league.badge.mark'): string {
  return localeUppercase(t(key)).split('\n').join(headingTracks() ? ' ' : '');
}

export function badgeExportPhrase(name: string): string {
  return localeUppercase(t('league.badge.phrase', { name }));
}

export function badgeExportSuffix(): string {
  const parts = splitTemplate(raw('league.badge.phrase'));
  const at = parts.findIndex((p) => p.kind === 'slot');
  const after = parts.slice(at + 1).map((p) => (p.kind === 'literal' ? p.text : '')).join('');
  return localeUppercase(after.trim());
}

export function moveExportName(name: string): string {
  return localeUppercase(name);
}

export const PARTNER_SPRITE = 96;
const ACE_SPRITE = 2 * PARTNER_SPRITE;

export function soloExportSprite(w: number, h: number): number {
  return soloSprite(w, h, 16 * K);
}

export const HEAD_PX = 8.5 * K;
export const HEAD_LINE = HEAD_PX * 1.4;
export const NAME_PX = HEAD_PX;
export const NAME_TRACK = 0.02 * NAME_PX;
export const NAME_LINE = NAME_PX * 1.4;

export const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };

export const BAND_BEFORE: Record<number, [NoArgKey, NoArgKey]> = {
  [ELITE_ROW]: ['league.band.elite', 'league.band.eliteNote'],
  [BOSS_ROW]: ['league.band.boss', 'league.band.bossNote'],
};

export const MARK_COL = Math.min(2.75 * 16 * K, 0.26 * (2 * COL - 2 * INX));
export const MARK_LABEL_PX = 6.7 * K;
export const MARK_TRACK = 0.06 * MARK_LABEL_PX;
export const TM_BADGE_W = 2.75 * 16 * K;
export const MARK_PAD = 7;
export const TM_CHIP_W = 0.9375 * 16 * K;
export const TM_CHIP_H = 0.6875 * 16 * K;
export const TM_TYPE_GAP = 3 * K;
export const TM_STACK_GAP = 2 * K;

const TM_DISC_PAD = 2 / 24;

const LATIN_EM_ASCENT = 0.73;

export function tmBadgeH(): number {
  return TM_BADGE_W / TYPE_BADGE_ASPECT;
}

export function tmMarkColumn(cy: number): {
  top: number;
  height: number;
  glyph: number;
  labelH: number;
  labelCy: number;
} {
  const glyph = MARK_COL * 0.72;
  const labelH = MARK_LABEL_PX * 1.2;
  const height = glyph + labelH - K;
  const top = cy - height / 2;
  return {
    top,
    height,
    glyph,
    labelH,
    labelCy: top + glyph - K + labelH / 2,
  };
}

function tmInkGapsFrom(
  mark: ReturnType<typeof tmMarkColumn>,
  body: { badgeY: number; nameTop: number; nameLines: number },
): { top: number; bottom: number } {
  const discTop = mark.top + TM_DISC_PAD * mark.glyph;
  const nameBottom =
    body.nameTop
    + (body.nameLines - 1) * NAME_LINE
    + (NAME_LINE - NAME_PX) / 2
    + LATIN_EM_ASCENT * NAME_PX;
  const tmBottom =
    mark.labelCy + LATIN_EM_ASCENT * MARK_LABEL_PX - MARK_LABEL_PX / 2;
  return {
    top: body.badgeY - discTop,
    bottom: tmBottom - nameBottom,
  };
}

export function tmMoveBody(cy: number, nameLines = 1): {
  top: number;
  height: number;
  badgeY: number;
  chipY: number;
  nameTop: number;
  nameCy: number;
  nameLines: number;
} {
  const lines = Math.max(1, nameLines);
  const badgeH = tmBadgeH();
  const typeRowH = Math.max(badgeH, TM_CHIP_H);
  const height = typeRowH + TM_STACK_GAP + lines * NAME_LINE;
  const naturalTop = cy - height / 2;
  const mark = tmMarkColumn(cy);
  const { top: topGap, bottom: bottomGap } = tmInkGapsFrom(mark, {
    badgeY: naturalTop + (typeRowH - badgeH) / 2,
    nameTop: naturalTop + typeRowH + TM_STACK_GAP,
    nameLines: lines,
  });
  const top = naturalTop + (bottomGap - topGap) / 2;
  const nameTop = top + typeRowH + TM_STACK_GAP;
  return {
    top,
    height,
    badgeY: top + (typeRowH - badgeH) / 2,
    chipY: top + (typeRowH - TM_CHIP_H) / 2,
    nameTop,
    nameCy: nameTop + NAME_LINE / 2,
    nameLines: lines,
  };
}

export function tmBodyShiftRem(nameLines = 1): number {
  const cy = 100;
  const lines = Math.max(1, nameLines);
  const badgeH = tmBadgeH();
  const typeRowH = Math.max(badgeH, TM_CHIP_H);
  const height = typeRowH + TM_STACK_GAP + lines * NAME_LINE;
  const naturalTop = cy - height / 2;
  const { top: topGap, bottom: bottomGap } = tmInkGapsFrom(tmMarkColumn(cy), {
    badgeY: naturalTop + (typeRowH - badgeH) / 2,
    nameTop: naturalTop + typeRowH + TM_STACK_GAP,
    nameLines: lines,
  });
  return ((bottomGap - topGap) / 4) / (16 * K);
}

// platform: Canvas `middle` is the em-box centre, while CSS `leading-[1.4]` centres the em square and sets Latin on the lower alphabetic baseline.
export function cssLineAlphabetic(
  lineTop: number,
  lineH: number,
  fontPx: number,
  emAscent: number,
): number {
  return lineTop + (lineH - fontPx) / 2 + emAscent;
}

export function tmInkGaps(cy: number, nameLines = 1): { top: number; bottom: number } {
  const body = tmMoveBody(cy, nameLines);
  return tmInkGapsFrom(tmMarkColumn(cy), body);
}

export function rowTop(row: number): number {
  let top = BAND;
  for (let r = 1; r < row; r++) {
    top += ROW;
    if (BAND_BEFORE[r + 1]) top += BAND + 2;
  }
  return top;
}

export function slotX(from: number, to: number): { left: number; width: number } {
  return {
    left: (from - 1) * COL + INX,
    width: (to - from + 1) * COL - 2 * INX,
  };
}

export function showcaseBox(): { left: number; top: number; width: number; height: number } {
  const { left, width } = slotX(1, 3);
  return { left, top: rowTop(1) + INY, width, height: 4 * ROW - 2 * INY };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The ace's and the partner's squares, in picture pixels, for a grid whose
 * top-left corner is at (`ox`, `oy`).
 *
 * The partner sits in the panel's bottom-right cell, centred on column 3, so
 * it stands over the team sprite below it. That centring leaves a gap to the
 * panel's right edge, and the partner keeps the same gap to the bottom edge.
 *
 * The ace is centred on the panel's top-left 2×2 cells. Inside the cell
 * insets those cells are 178px tall. A centred 192px square would start 7px
 * above the panel, and the panel would clip a sprite drawn up to the top of
 * its frame, such as Celesteela or Raging Bolt. So the ace moves down until
 * it keeps the partner's gap to the top edge. Its left edge is rounded to a
 * whole pixel, which keeps its 2× pixels square.
 */
export function showcaseSquares(ox: number, oy: number): { ace: Box; partner: Box } {
  const box = showcaseBox();
  const partnerCx = 2.5 * COL;
  const gap = box.left + box.width - (partnerCx + PARTNER_SPRITE / 2);
  const partner = {
    x: ox + partnerCx - PARTNER_SPRITE / 2,
    y: oy + box.top + box.height - gap - PARTNER_SPRITE,
    w: PARTNER_SPRITE,
    h: PARTNER_SPRITE,
  };
  const zoneCy = (rowTop(1) + rowTop(2) + ROW) / 2;
  const aceCy = Math.max(zoneCy, box.top + gap + ACE_SPRITE / 2);
  const ace = {
    x: Math.round(ox + COL - ACE_SPRITE / 2),
    y: Math.round(oy + aceCy - ACE_SPRITE / 2),
    w: ACE_SPRITE,
    h: ACE_SPRITE,
  };
  return { ace, partner };
}

export const CAPTION_GAP_Y = 0.0625 * 16 * K;
export const CAPTION_GAP_X = 0.1875 * 16 * K;
export const SHOWCASE_PAD = 0.25 * 16 * K;
export const CAPTION_NAME_MIN_PX = MARK_LABEL_PX;
export const CAPTION_HALO = 0.125 * 16 * K;

const TAN_30 = Math.tan(Math.PI / 6);
const COS_30 = Math.cos(Math.PI / 6);

export const SEAM_SQUARE_CLEAR = 0.25 * 16 * K;

export const SEAM_FADE = 0.5;

function depthOf(x: number, y: number): number {
  return y + TAN_30 * x;
}

interface SeamSide {
  square: Box;
  lines: readonly Box[];
}

export function seamDepth(ace: SeamSide, partner: SeamSide): number {
  const lo = Math.max(...[ace.square, ...ace.lines].map((b) => depthOf(b.x + b.w, b.y + b.h)));
  const hi = Math.min(...[partner.square, ...partner.lines].map((b) => depthOf(b.x, b.y)));
  const clear = SEAM_SQUARE_CLEAR / COS_30;
  const min = depthOf(ace.square.x + ace.square.w, ace.square.y + ace.square.h) + clear;
  const max = depthOf(partner.square.x, partner.square.y) - clear;
  return Math.min(max, Math.max(min, (lo + hi) / 2));
}

export function seamSegment(
  box: Box,
  depth: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const yAt = (x: number) => depth - TAN_30 * x;
  const xAt = (y: number) => (depth - y) / TAN_30;
  const [x1, y1] = yAt(box.x) > bottom ? [xAt(bottom), bottom] : [box.x, yAt(box.x)];
  const [x2, y2] = yAt(right) < box.y ? [xAt(box.y), box.y] : [right, yAt(right)];
  return { x1, y1, x2, y2 };
}

export function gridHeight(): number {
  return rowTop(ROW_COUNT) + ROW;
}

export function gridTop(): number {
  return TITLE_BLOCK_H;
}

export const K2 = 96 / 42;

export const ROW2 = 44 * K2;
export const BAND2 = 20 * K2;
const HPADY = 4 * K2;
export const HPADX = 8 * K2;
export const GLYPH_COL = 57 * K2;
export const TYPE_COL = 32 * K2;
export const HOME_HDR_H = 24 * K2;
export const HOME_R = 5 * K2;

export const HOME_RAIL = 3 * K2;

const HOME_GUTTER = HPADX + HOME_RAIL - HOME_R;

const HOME_BODY_H = 14 * ROW2 + 4 * BAND2 + 3 * 2 + FOOT;

export function homeTopPad(named: boolean, homeW: number): number {
  if (named) return HPADY;
  const r = EXPORT_CORNER_RATIO;
  const fromWidth = (homeW + 2 * FRAME) * r - FRAME - HOME_R;
  const fromHeight = ((HOME_BODY_H + 2 * FRAME) * r - FRAME - HOME_R) / (1 - r);
  return Math.max(HOME_GUTTER, Math.min(fromWidth, fromHeight));
}

const HOME_W = BOX_W;
const HOME_INNER = HOME_W - 2 * HPADX;
export const SEAT_COUNT = 6;
const SEAT_COL = (HOME_INNER - GLYPH_COL - TYPE_COL) / SEAT_COUNT;

const HOME_DETAILS_MIN =
  SEAT_COUNT * SEAT_COL - (GLYPH_COL + TYPE_COL + HOME_R - HOME_RAIL);
const HOME_DETAILS_MAX = 310 * K2;
export const HOME_SIDE_GAP = 20 * K2;

export const HOME_TYPE_MARK = 22 * K2;
export function homeTypeMarkRadius(size: number): number {
  return (size / HOME_TYPE_MARK) * HOME_R;
}

export const HOME_DETAIL_ICON = 9 * K2;
export const HOME_DETAIL_TYPE = 9 * K2;
export const HOME_DETAIL_GAP = 4 * K2;
export const HOME_DETAIL_CHIP_H = 8 * K2;
export const HOME_DETAIL_CHIP_W = HOME_DETAIL_CHIP_H * (0.9375 / 0.6875);
export const HOME_DETAIL_PAD_Y = 3 * K2;

export const HOME_MARK_LABEL_PX = 8 * K2;
export const HOME_MARK_TRACK = 0.06 * HOME_MARK_LABEL_PX;
export const HOME_THEME_TEXT_PX = 9.5 * K2;

export interface HomeExportGeometry {
  homeW: number;
  homeInner: number;
  seatCol: number;
  detailsCol: number;
  leadGap: number;
  sideGap: number;
  blockWidth: number;
}

export function homeExportGeometry(
  gymDetails: boolean,
  sideBySide: boolean,
  detailsNeed: number,
): HomeExportGeometry {
  const detailsCol = gymDetails
    ? Math.min(HOME_DETAILS_MAX, Math.max(HOME_DETAILS_MIN, Math.ceil(detailsNeed)))
    : 0;
  const seatCol = SEAT_COL;
  const blockWidth = SEAT_COUNT * seatCol;
  const leadGap = gymDetails || sideBySide ? HOME_SIDE_GAP : 0;
  const sideGap = sideBySide ? HOME_SIDE_GAP : 0;
  const extraW = detailsCol + leadGap + (sideBySide ? blockWidth + sideGap : 0);
  return {
    homeW: HOME_W + extraW,
    homeInner: HOME_INNER + extraW,
    seatCol,
    detailsCol,
    leadGap,
    sideGap,
    blockWidth,
  };
}

export function homeTeamOriginX(ox: number, geom: HomeExportGeometry): number {
  return ox + GLYPH_COL + TYPE_COL + geom.detailsCol + geom.leadGap;
}

export function homeVacancyAnchorX(
  ox: number,
  geom: HomeExportGeometry,
  bothTeams: boolean,
): number {
  const teamBaseX = homeTeamOriginX(ox, geom);
  if (bothTeams) return teamBaseX + 2 * geom.blockWidth + geom.sideGap;
  return teamBaseX + geom.blockWidth;
}

interface HomeSectionPill {
  x: number;
  w: number;
  label: string | null;
  align: 'left' | 'right';
}

export function homeSectionPills(
  ox: number,
  geom: HomeExportGeometry,
  title: string,
  splitTeams: boolean,
  nameTeams: boolean,
): HomeSectionPill[] {
  const bandX = ox + HOME_RAIL - HOME_R;
  const bandRight = ox + geom.homeInner - HOME_RAIL + HOME_R;
  if (!splitTeams) {
    return [{ x: bandX, w: bandRight - bandX, label: title, align: 'left' }];
  }
  const teamBaseX = homeTeamOriginX(ox, geom);
  const rematchX = teamBaseX + geom.blockWidth + geom.sideGap;
  return [
    {
      x: bandX,
      w: Math.max(0, teamBaseX - geom.sideGap - bandX),
      label: title,
      align: 'left',
    },
    { x: teamBaseX, w: geom.blockWidth, label: nameTeams ? localeUppercase(t('league.export.storyTeams')) : null, align: 'right' },
    { x: rematchX, w: geom.blockWidth, label: nameTeams ? localeUppercase(t('league.export.rematchTeams')) : null, align: 'right' },
  ];
}

export const SECTION_BEFORE: Record<number, NoArgKey> = {
  0: 'league.section.gyms',
  8: 'league.section.elite',
  12: 'league.section.champion',
  13: 'league.section.boss',
};

export const VACANCY: Record<string, NoArgKey> = {
  gym: 'league.vacancy.gym',
  elite: 'league.vacancy.elite',
  champion: 'league.vacancy.champion',
  boss: 'league.vacancy.boss',
};

export const CARD_IMG_W = CARD_W + 2 * FRAME;
export const CARD_IMG_H = TITLE_BLOCK_H + gridHeight() + FOOT + FRAME;

export function homeImgH(named: boolean, homeW: number): number {
  return Math.ceil(homeTopPad(named, homeW) + (named ? HOME_HDR_H : 0) + HOME_BODY_H);
}

export { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT };
