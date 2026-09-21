/**
 * The export's geometry, in export pixels.
 *
 * Both exports are drawn on a canvas at 1× sprites, which fixes the scale: a
 * team sprite is its native 96px, and every rem-based measurement is the app's
 * own value multiplied by `K`. Nothing here reads the DOM, so the numbers are
 * the same on every engine and the tests can assert them without a browser.
 *
 * The design of record is the canvas at
 * docs/future-tools/league-builder/DECISIONS.md; the artboards were generated
 * from these same constants.
 */

import { localeUppercase } from '@/i18n';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { pairSprite, soloSprite } from '../slotLayout';
import { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT } from '../model/constants';

/** Export px per app rem-unit: the card's 3.25rem sprite is 96px. */
export const K = 96 / 52;

// ---------- the picture, shared by both exports ----------

/**
 * One box for both pictures.
 *
 * Each picture is its content, edge to edge: no page around it and no card
 * chrome, so nothing reads as a card floating on a blank ground. The league is
 * the box wide; the trainer card wears a frame either side of it, so it runs
 * 24px wider. Each picture is as tall as its own content.
 *
 * The box is the league's natural width at 1× sprites. The trainer card's
 * columns are derived from it below.
 */
export const BOX_W = 864;

/** The credit strip under the content. */
export const FOOT = 36;

/**
 * The credit's size and its prefix. Fitted to a 393pt phone screen a 14px run
 * lands at about 6.4pt, the size the dex poster's credit lands at.
 */
export const CREDIT_PX = 14;
export const CARD_CREDIT_PREFIX = "/vp/'s Pro Trainer Card";
export const HOME_CREDIT_PREFIX = 'Pokémon League Builder';

// ---------- the gym card ----------

/**
 * Half a pixel over the app's 15, so that with an odd column every cell
 * centre, and so every sprite, lands on a whole pixel. A sprite drawn from a
 * half pixel is resampled by one device pixel against the same sprite laid
 * out by the browser, which showed up as hatching over every team member
 * when the export was diffed against its artboard.
 */
export const PADX = 15.5;
/**
 * The column: the box less the card's padding, over seven.
 *
 * On a phone the app fits the card by keeping the pane's width and giving up
 * height, so the columns end up wider than the rows are tall: 3.9rem across
 * to 3.375rem down, measured on an iPhone. The desktop's 3.11rem column made
 * the export taller and narrower than the card people actually look at. At
 * 119px the column is a touch wider still, so the trainer card can share the
 * league's box.
 */
export const COL = (BOX_W - 2 * PADX) / 7;
export const ROW = 100;
/** A spacer band's height. */
export const BAND = 37;
/** Vertical inset of a cell inside its row. */
export const INY = 11;
/** Horizontal inset of a cell inside its column. */
export const INX = 5.5;

/**
 * The left rail: the one left edge every run of text starts on.
 *
 * A glyph cell and a slot are drawn one inset in from the card's padding, and
 * that inset is the rail. Text starts there — the bar's title, the THEME
 * label, a band's label — rather than the box the text sits in.
 *
 * A rounded box overhangs the rail by its own corner radius, so its curve
 * ends where the rail is and its label starts there. It overhangs the rail's
 * mirror on the right by the same amount, so the picture stays symmetric and
 * the overhang stays short.
 */
export const RAIL = 3 * K;

export const CELL_R = 11;
export const BAND_R = 9;
export const SLOT_R = 15;

export const CARD_W = BOX_W;

/**
 * The title row: "Pro Trainer Card", a break, then the type badge and "Type
 * Specialist", all at one size and one weight so the row reads as a header
 * rather than a title with a caption. A card with no type shows the title
 * alone. The row is a whole pixel tall so the grid under it starts on one.
 */
export const CARD_TITLE = 'Pro Trainer Card';
export const SPECIALIST = 'Type Specialist';
export const TITLE_SEP = '·';
export const TITLE_PX = 15 * K;
export const TITLE_TRACK = -0.01 * TITLE_PX;
export const TITLE_ROW_H = 34;
/** Either side of the break. */
export const TITLE_GAP = 14;
/** Between the badge and "Type Specialist". */
export const TITLE_WORD_GAP = 8;
/** The badge, a touch over the 4.5rem the first draft had. */
export const TITLE_BADGE_W = 5 * 16 * K;
export const TITLE_BADGE_H = TITLE_BADGE_W / TYPE_BADGE_ASPECT;

/**
 * The theme row: THEME, then a white rounded field to the right edge, so the
 * theme reads as something its owner filled in. The label keeps the size it
 * had; the value is the size the showcase names were set at.
 */
export const THEME_LABEL_PX = 10.5 * K;
export const THEME_TEXT_PX = 13 * K;
/** Between the title row and the theme field. */
export const THEME_GAP = 14;
export const FIELD_H = 40;
export const FIELD_R = 10;
export const FIELD_PADX = 12;
/** Between THEME and its field. */
export const LABEL_GAP = 8;
/** Under the theme field, above the first band. */
export const HDR_GAP = 16;

/**
 * The header bar: the band shade, edge to edge across the top of the picture
 * with square corners, and the title row inside it in white. It is the
 * picture's own top edge rather than a card on it. A card with no type takes
 * the site's red. The title starts on the rail, so it shares a left edge with
 * the bands and the leftmost glyph cells under it, and the badge wears a
 * white ring so the pill reads on the bar.
 */
export const BAR_PADY = 20;
export const BAR_H = TITLE_ROW_H + 2 * BAR_PADY;
export const BAR_TEXT_X = PADX + RAIL;
export const BAR_RING = 2;
/** The bar, the theme field and their gaps: what sits above the grid. */
export const TITLE_BLOCK_H = BAR_H + THEME_GAP + FIELD_H + HDR_GAP;

/**
 * The frame: the bar's own colour down both sides and along the bottom, with
 * the bar as the top edge, so the picture reads as one bordered card. The
 * content keeps its size and the picture grows by the frame. The league stays
 * bare: a frame in its spacer red was tried and turned down.
 */
export const FRAME = 12;

/**
 * Native 2× source pixels. Export paint size is `pairExportSprite`: 96, 192,
 * or 288. Never a fraction of 96.
 */
export const SIG_SPRITE = 192;

/** Showcase headings. Same two-line caps the live card paints. */
export const ACE_HEAD = ['ACE', 'POKÉMON'];
export const PARTNER_HEAD = ['PARTNER /', 'SHOULDERMON'];

/** Badge phrase in the same caps as ACE POKÉMON. */
export function badgeExportPhrase(name: string): string {
  return localeUppercase(`${name} Badge`);
}

/** Move name in the same caps as ACE POKÉMON. */
export function moveExportName(name: string): string {
  return localeUppercase(name);
}

/**
 * Ace/partner edge in export pixels: 1×, 2×, or 3× of the team cell (96).
 * The live card sizes these as n×SPRITE_REM rem so the fit zoom paints n×96.
 * Export rem is 16×K, so the same n lands on n×96 canvas px. css×K (~118)
 * is not an integer scale of the 96px asset and aliases it.
 */
export function pairExportSprite(w: number, h: number): number {
  return pairSprite(w, h, 16 * K);
}

/**
 * One ace or one partner, centered. Largest of 1×, 2×, 3× of 96 that still
 * fits the slot after pad, heading and name.
 */
export function soloExportSprite(w: number, h: number): number {
  return soloSprite(w, h, 16 * K);
}

/** The slot heading runs: two lines, 0.53125rem extrabold, 1.4 line-height. */
export const HEAD_PX = 8.5 * K;
export const HEAD_TRACK = 0.08 * HEAD_PX;
export const HEAD_LINE = HEAD_PX * 1.4;
/** Species, TM, and badge names. Same rem as ACE POKÉMON / CardGrid NAME_CLASS. */
export const NAME_PX = HEAD_PX;
export const NAME_TRACK = 0.02 * NAME_PX;
export const NAME_LINE = NAME_PX * 1.4;

/** The glyph cell spans two columns on rows 1, 8 and 9. */
export const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };

export const BAND_BEFORE: Record<number, [string, string]> = {
  [ELITE_ROW]: ['ELITE FOUR & CHAMPION', 'Champion may have one Mega/Gigantamax'],
  [BOSS_ROW]: ['ENDGAME BOSS TEAM', 'may also include one minor Legendary'],
};

/**
 * Glyph column for the TM and badge slots.
 *
 * CardGrid uses `min(2.75rem, 26%)` of the slot. A fixed 45px column made the
 * disc as short as the type row, so `items-center` pinned their tops together
 * and the move name sat on the disc.
 */
export const MARK_COL = Math.min(2.75 * 16 * K, 0.26 * (2 * COL - 2 * INX));
export const MARK_LABEL_PX = 6.7 * K;
export const MARK_TRACK = 0.06 * MARK_LABEL_PX;
export const TM_BADGE_W = 2.75 * 16 * K;
export const MARK_PAD = 7;
/** Same rem as ACE POKÉMON. The live card does not shrink the move name. */
export const MOVE_PX = HEAD_PX;
export const MOVE_MIN_PX = HEAD_PX;
/** Live card stacks the type badge and category above the move name. */
export const TM_TYPE_ABOVE_NAME = true;
/** CardGrid CategoryChip on the TM slot: `h-[0.6875rem] w-[0.9375rem]`. */
export const TM_CHIP_W = 0.9375 * 16 * K;
export const TM_CHIP_H = 0.6875 * 16 * K;
/** CardGrid type-row `gap-[3px]` and stack `gap-[2px]`. */
export const TM_TYPE_GAP = 3 * K;
export const TM_STACK_GAP = 2 * K;

export function tmBadgeH(): number {
  return TM_BADGE_W / TYPE_BADGE_ASPECT;
}

/**
 * Disc + TM word, as `drawMarkColumn` paints them: a column centred on `cy`.
 *
 * Same grouping as CardGrid's mark `flex-col` (disc at 72% of the column,
 * label pulled up by one `K` against the disc's viewBox padding).
 */
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

/**
 * Type badge + category chip + move name, as CardGrid's TM slot lays them
 * out: a column beside the disc, vertically centred with the disc+TM column.
 *
 * The live slot is `flex items-center`. The type row is also `items-center`,
 * so its box is the taller of the 5:1 badge and the category chip. The name
 * box is the CSS line (`NAME_LINE`), the same `leading-[1.4]` NAME_CLASS uses.
 */
export function tmMoveBody(cy: number): {
  top: number;
  height: number;
  badgeY: number;
  chipY: number;
  nameTop: number;
  nameCy: number;
} {
  const badgeH = tmBadgeH();
  const typeRowH = Math.max(badgeH, TM_CHIP_H);
  const height = typeRowH + TM_STACK_GAP + NAME_LINE;
  const top = cy - height / 2;
  const nameTop = top + typeRowH + TM_STACK_GAP;
  return {
    top,
    height,
    badgeY: top + (typeRowH - badgeH) / 2,
    chipY: top + (typeRowH - TM_CHIP_H) / 2,
    nameTop,
    nameCy: nameTop + NAME_LINE / 2,
  };
}

/**
 * Alphabetic baseline for a CSS line box of height `lineH` at `fontPx`.
 *
 * Canvas `middle` is the em-box centre. CSS `leading-[1.4]` centres the em
 * square and sits Latin on the alphabetic baseline, below that centre.
 */
export function cssLineAlphabetic(
  lineTop: number,
  lineH: number,
  fontPx: number,
  emAscent: number,
): number {
  return lineTop + (lineH - fontPx) / 2 + emAscent;
}

/** Top of a row inside the grid box, which starts at the first band. */
export function rowTop(row: number): number {
  let top = BAND;
  for (let r = 1; r < row; r++) {
    top += ROW;
    if (BAND_BEFORE[r + 1]) top += BAND + 2;
  }
  return top;
}

/**
 * Left edge and width of a slot spanning columns `from`..`to`, 1-indexed,
 * measured from the grid's own left edge (the card's content box).
 *
 * The slot wears the same horizontal inset a team cell does, so its left
 * edge lines up with the cells below it and its right edge stops one inset
 * short of the next column. An earlier version also added the card's padding
 * here, which pushed all three slots 15px right and over the glyph cells.
 */
export function slotX(from: number, to: number): { left: number; width: number } {
  return {
    left: (from - 1) * COL + INX,
    width: (to - from + 1) * COL - 2 * INX,
  };
}

/** The ace/partner slot: three columns wide, four rows tall. */
export function showcaseBox(): { left: number; top: number; width: number; height: number } {
  const { left, width } = slotX(1, 3);
  return { left, top: rowTop(1) + INY, width, height: 4 * ROW - 2 * INY };
}

export function gridHeight(): number {
  return rowTop(ROW_COUNT) + ROW;
}

/** The grid's top inside the picture: under the bar and the theme field. */
export function gridTop(): number {
  return TITLE_BLOCK_H;
}

// ---------- the league home ----------

/** Export px per app rem-unit on the home, whose seat sprite is 2.625rem. */
export const K2 = 96 / 42;

export const ROW2 = 44 * K2;
export const BAND2 = 20 * K2;
export const HPADY = 4 * K2;
export const HPADX = 8 * K2;
/**
 * The glyph column is wider than the app's own 2.75rem: its cell is drawn at
 * three by two, the shape the cell has on a phone once the home is fitted to
 * the screen, rather than the near-square the stylesheet asks for.
 */
export const GLYPH_COL = 57 * K2;
export const TYPE_COL = 32 * K2;
/**
 * One line: the league's name.
 *
 * An unnamed league has no line at all — no placeholder, and no tag saying
 * which teams these are — so the picture starts at its first band and is a
 * line shorter. `homeImgH` takes the height from that.
 */
export const HOME_HDR_H = 24 * K2;
export const HOME_R = 5 * K2;

/**
 * The home's left rail, the counterpart of the card's.
 *
 * A glyph cell is drawn one inset inside its row, so the league's name and a
 * section band's label start there too. The band overhangs the rail by its
 * own corner radius, and by the same amount past the rail's mirror.
 */
export const HOME_RAIL = 3 * K2;

/**
 * What a band sits in from the picture's left and right edges.
 *
 * An unnamed league has no name line, so this is also the whitespace above
 * its first band: the band then has the same air on three sides.
 */
export const HOME_GUTTER = HPADX + HOME_RAIL - HOME_R;

/** The whitespace above the first thing the picture draws. */
export function homeTopPad(named: boolean): number {
  return named ? HPADY : HOME_GUTTER;
}

export const HOME_W = BOX_W;
export const HOME_INNER = HOME_W - 2 * HPADX;
/** Team seats per row — six wide, matching the largest team the template holds. */
export const SEAT_COUNT = 6;
/**
 * Default team column width at the standard picture width, with no optional
 * columns. Six seats share what the glyph and type columns leave; the old
 * seven-column grid left a dead column between the type mark and the team.
 */
export const SEAT_COL = (HOME_INNER - GLYPH_COL - TYPE_COL) / SEAT_COUNT;

/**
 * Gym-detail column: theme, TM, and badge on three lines. Sized for a
 * THEME label plus ~28 characters of theme, and for a TM row (disc, 12-letter
 * move at the smallcaps mark size, 1×1 type square, category chip)
 * without clipping.
 */
export const HOME_DETAILS_COL = 220 * K2;
/**
 * Air between the details column, story teams, and rematch teams — and
 * between the spacers that sit on those blocks. One number, so the gaps
 * stay uniform when the gym-leader spacer splits.
 */
export const HOME_SIDE_GAP = 20 * K2;

/** Type square on a league row. Gym-detail type marks scale from this. */
export const HOME_TYPE_MARK = 22 * K2;
/**
 * Corner radius for a type mark of `size`, matching the row square's
 * `HOME_R / HOME_TYPE_MARK` ratio. Using `HOME_R` on a smaller square
 * turns the mark into a circle.
 */
export function homeTypeMarkRadius(size: number): number {
  return (size / HOME_TYPE_MARK) * HOME_R;
}

/**
 * TM disc, type square, and badge hex inside one third of a home row.
 * Larger than this and the three lines overlap each other.
 */
export const HOME_DETAIL_ICON = 9 * K2;
export const HOME_DETAIL_TYPE = 9 * K2;
export const HOME_DETAIL_GAP = 4 * K2;
export const HOME_DETAIL_CHIP_H = 8 * K2;
export const HOME_DETAIL_CHIP_W = HOME_DETAIL_CHIP_H * (0.9375 / 0.6875);
export const HOME_DETAIL_PAD_Y = 3 * K2;

/** Home-export label and body sizes that mirror the gym card's TM/badge marks. */
export const HOME_MARK_LABEL_PX = 8 * K2;
export const HOME_MARK_TRACK = 0.06 * HOME_MARK_LABEL_PX;
/**
 * Sentence-case theme. Inter's x-height is ~0.53em; smallcaps cap-height is
 * ~0.72em at `HOME_MARK_LABEL_PX`. At 9.5 the x-height sits just under that
 * smallcaps height, instead of matching the old 11px move size.
 */
export const HOME_THEME_TEXT_PX = 9.5 * K2;
export const HOME_TM_BADGE_W = 2.2 * 16 * K2;

export interface HomeExportGeometry {
  homeW: number;
  homeInner: number;
  seatCol: number;
  detailsCol: number;
  /** Gap after the details (or type) column, before the first team block. */
  leadGap: number;
  sideGap: number;
  blockWidth: number;
}

/**
 * Picture width for export permutations. Team seats keep the default
 * `SEAT_COL`; optional columns, lead gaps, and side-by-side blocks add width only.
 */
export function homeExportGeometry(gymDetails: boolean, sideBySide: boolean): HomeExportGeometry {
  const detailsCol = gymDetails ? HOME_DETAILS_COL : 0;
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

/** Left edge of the first team block (story, or the only team). */
export function homeTeamOriginX(ox: number, geom: HomeExportGeometry): number {
  return ox + GLYPH_COL + TYPE_COL + geom.detailsCol + geom.leadGap;
}

/**
 * Right edge vacancy copy aligns to. Combined story/rematch exports pin
 * that edge to the rematch block, not the leftover air after it.
 */
export function homeVacancyAnchorX(
  ox: number,
  geom: HomeExportGeometry,
  bothTeams: boolean,
): number {
  const teamBaseX = homeTeamOriginX(ox, geom);
  if (bothTeams) return teamBaseX + 2 * geom.blockWidth + geom.sideGap;
  return teamBaseX + geom.blockWidth;
}

export interface HomeSectionPill {
  x: number;
  w: number;
  label: string | null;
  align: 'left' | 'right';
}

/**
 * Section-band pills. Gym leaders in both-teams mode split into three
 * equal-gapped pills (title, story, rematch). Every later band stays one
 * full-width pill.
 */
export function homeSectionPills(
  ox: number,
  geom: HomeExportGeometry,
  title: string,
  splitTeams: boolean,
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
    { x: teamBaseX, w: geom.blockWidth, label: 'STORY TEAMS', align: 'right' },
    { x: rematchX, w: geom.blockWidth, label: 'REMATCH TEAMS', align: 'right' },
  ];
}

/** The section band drawn before a slot index. */
export const SECTION_BEFORE: Record<number, string> = {
  0: 'GYM LEADERS',
  8: 'ELITE FOUR',
  12: 'CHAMPION',
  13: 'ENDGAME BOSS',
};

/** What an empty row says, by slot kind. */
export const VACANCY: Record<string, string> = {
  gym: 'Gym leader vacancy',
  elite: 'Elite Four vacancy',
  champion: 'Champion vacancy',
  boss: 'No endgame boss trainer',
};

// ---------- the pictures: one width, each as tall as its content ----------

/**
 * The trainer card: the frame either side; the bar and the theme field, the
 * grid, and the credit; and the frame's bottom edge.
 */
export const CARD_IMG_W = CARD_W + 2 * FRAME;
export const CARD_IMG_H = TITLE_BLOCK_H + gridHeight() + FOOT + FRAME;

/**
 * The league: its padding, the name line if there is one, four bands with
 * their gaps, fourteen rows, and the credit.
 */
export function homeImgH(named: boolean): number {
  return Math.ceil(
    homeTopPad(named) + (named ? HOME_HDR_H : 0) + 14 * ROW2 + 4 * BAND2 + 3 * 2 + FOOT,
  );
}

export { ELITE_ROW, CHAMPION_ROW, BOSS_ROW, ROW_COUNT };
