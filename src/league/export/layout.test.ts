import { describe, expect, it } from 'vitest';
import * as L from './layout';
import { showcasePair, exportRow, vacantRow, homeRowsForCard } from './exportLeague';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import { TEAM_SIZES, slotRow } from '../model/constants';
import { kantoCards } from '../data/kantoLeague';
import { DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT } from './exportOptions';

/**
 * The export's geometry is arithmetic, not layout: nothing here reads the DOM,
 * so a drift shows up as a failing number rather than as a crooked picture
 * somebody has to notice. The card's own drawing is verified by rendering it
 * and diffing against the design canvas, which these numbers underwrite.
 */
describe('export layout', () => {
  it('gives the card seven columns and its padding', () => {
    expect(L.CARD_W).toBe(7 * L.COL + 2 * L.PADX);
  });

  it('frames the trainer card and leaves the league bare, each as tall as its content', () => {
    // The picture is the content, edge to edge: no page and no card chrome.
    // The card wears a 12px frame in the bar's colour down its sides and
    // along its bottom; the league is the bare box. Each picture ends just
    // under its own credit, or its frame.
    expect(L.CARD_W).toBe(L.BOX_W);
    expect(L.HOME_W).toBe(L.BOX_W);
    expect(L.CARD_IMG_W).toBe(L.CARD_W + 2 * L.FRAME);
    expect(L.CARD_IMG_H).toBe(L.TITLE_BLOCK_H + L.gridHeight() + L.FOOT + L.FRAME);
    expect(L.TITLE_BLOCK_H).toBe(L.BAR_H + L.THEME_GAP + L.FIELD_H + L.HDR_GAP);
    expect(L.homeImgH(true)).toBe(
      Math.ceil(L.HPADY + L.HOME_HDR_H + 14 * L.ROW2 + 4 * L.BAND2 + 6 + L.FOOT),
    );
    // An unnamed league draws no name line, so its picture is that shorter —
    // less the deeper top pad its first band takes instead.
    expect(L.homeImgH(true) - L.homeImgH(false))
      .toBe(Math.round(L.HOME_HDR_H - (L.HOME_GUTTER - L.HPADY)));
    // That pad is the gutter: the band has the same air above it as beside it.
    expect(L.homeTopPad(false)).toBe(L.HPADX + L.HOME_RAIL - L.HOME_R);
    expect(L.homeTopPad(true)).toBe(L.HPADY);
    expect(L.CARD_IMG_H).toBeLessThan(L.homeImgH(false));
  });

  it('gives the trainer card the column it has on a phone', () => {
    // Fitted to a phone the card keeps the pane's width and gives up height,
    // so its columns run wider than its rows are tall. The desktop's column
    // is 92px in these units; the phone's, measured, 115px.
    expect(L.COL).toBeGreaterThanOrEqual(115);
    expect(L.ROW / L.COL).toBeLessThan(0.9);
    expect(Number.isInteger(L.COL)).toBe(true);
  });

  it('puts every team sprite on a whole pixel', () => {
    // A sprite centred on a half pixel is resampled one device pixel off the
    // browser's own placement of the same sprite, which reads as hatching.
    // The title block above the grid is a whole height for the same reason.
    expect(Number.isInteger(L.TITLE_BLOCK_H)).toBe(true);
    expect(Number.isInteger(L.FRAME)).toBe(true);
    for (let i = 0; i < 7; i++) {
      expect(Number.isInteger(L.FRAME + L.PADX + (i + 0.5) * L.COL)).toBe(true);
    }
    for (let row = 1; row <= L.ROW_COUNT; row++) {
      expect(Number.isInteger(L.gridTop() + L.rowTop(row) + L.ROW / 2)).toBe(true);
    }
  });

  it('starts the title, the theme label and the grid on one left rail', () => {
    // The header block and the grid share a left edge. A band and a glyph
    // cell are drawn one rail in from the card's padding, and a row that
    // fills all seven columns leaves no lead, so its glyph cell is the
    // leftmost on the card. The title and THEME start from the same x.
    expect(L.BAR_TEXT_X).toBe(L.PADX + L.RAIL);
    const leads = TEAM_SIZES.map((size, i) => 7 - size - (L.GLYPH_SPAN[i + 1] ?? 1));
    expect(Math.min(...leads)).toBe(0);
    expect(L.RAIL).toBeCloseTo(L.INX, 1);
  });

  it('fits the title row inside the bar, with the ringed badge inside it', () => {
    // At 0.7em a glyph, wider than Inter's extrabold runs, the whole row
    // still fits from the rail: the name, the break, the badge, and
    // "Type Specialist".
    const words = (L.CARD_TITLE.length + L.SPECIALIST.length) * 0.7 * L.TITLE_PX;
    const row = words + 0.4 * L.TITLE_PX + L.TITLE_BADGE_W + 2 * L.TITLE_GAP + L.TITLE_WORD_GAP;
    expect(L.BAR_TEXT_X + row).toBeLessThan(L.CARD_W - L.PADX);
    expect(L.TITLE_BADGE_H + 2 * L.BAR_RING).toBeLessThanOrEqual(L.BAR_H);
    expect(L.TITLE_PX * 1.2).toBeLessThanOrEqual(L.TITLE_ROW_H);
    expect(L.BAR_H).toBeGreaterThan(L.TITLE_ROW_H);
  });

  it('keeps both showcase blocks inside the slot', () => {
    const box = L.showcaseBox();
    const head = 2 * L.HEAD_LINE;
    const pad = 0.5 * 16 * L.K;
    const sprite = L.pairExportSprite(box.width, box.height);
    const aceTop = pad;
    const aceBottom = pad + head + sprite;
    const partnerTop = box.height - pad - head - sprite;
    const partnerBottom = box.height - pad;
    expect(aceTop).toBeGreaterThanOrEqual(0);
    expect(partnerBottom).toBeLessThanOrEqual(box.height);
    expect(partnerTop - aceBottom).toBeGreaterThan(0);
    expect(sprite % 96).toBe(0);
    expect(sprite).toBeLessThan(box.width);
    expect(sprite).toBeLessThan(box.height);
  });

  it('gives the theme field room for its text and its label', () => {
    expect(L.THEME_TEXT_PX * 1.25).toBeLessThan(L.FIELD_H);
    expect(L.THEME_LABEL_PX).toBeLessThan(L.THEME_TEXT_PX);
    expect(L.THEME_LABEL_PX).toBeGreaterThanOrEqual(12);
  });

  it('leaves a band before the elite and endgame rows only', () => {
    // Each row is one row-height further down, plus a band where one is drawn.
    for (let row = 2; row <= L.ROW_COUNT; row++) {
      const step = L.rowTop(row) - L.rowTop(row - 1);
      expect(step).toBe(L.BAND_BEFORE[row] ? L.ROW + L.BAND + 2 : L.ROW);
    }
    expect(Object.keys(L.BAND_BEFORE).map(Number).sort((a, b) => a - b)).toEqual([
      L.ELITE_ROW,
      L.BOSS_ROW,
    ]);
  });

  it('places a banded row so its band clears the row above', () => {
    // The band is drawn one band-height back from the row, and the two-pixel
    // gap sits above it. Getting this backwards raised every band by 2px.
    const bandTop = L.rowTop(L.ELITE_ROW) - L.BAND;
    expect(bandTop).toBe(L.rowTop(L.ELITE_ROW - 1) + L.ROW + 2);
  });

  it('fits the showcase slot inside three columns and four rows', () => {
    const box = L.showcaseBox();
    expect(box.width).toBe(3 * L.COL - 2 * L.INX);
    expect(box.height).toBe(4 * L.ROW - 2 * L.INY);
    // The signature block: two heading lines, a gap, and the 2x sprite.
    expect(2 * L.HEAD_LINE + 12 + L.SIG_SPRITE).toBeLessThan(box.height);
  });

  it('draws the solo showcase sprite at a whole multiple of the source, larger than the pair', () => {
    const box = L.showcaseBox();
    const sprite = L.soloExportSprite(box.width, box.height);
    expect(sprite % 96).toBe(0);
    expect(sprite).toBeGreaterThanOrEqual(96);
    expect(sprite).toBeGreaterThan(L.pairExportSprite(box.width, box.height));
    const pad = 0.5 * 16 * L.K;
    expect(sprite).toBeLessThanOrEqual(box.width - 2 * pad);
    expect(2 * L.HEAD_LINE + L.NAME_LINE + sprite + 2 * pad).toBeLessThanOrEqual(box.height);
  });

  it('gives the TM and badge slots the same box', () => {
    const tm = L.slotX(1, 2);
    expect(tm.width).toBe(2 * L.COL - 2 * L.INX);
    // The mark column, its two paddings and the body all fit the box.
    expect(L.MARK_PAD + L.MARK_COL + L.MARK_PAD + L.TM_BADGE_W).toBeLessThan(tm.width);
  });

  it('keeps every slot clear of the glyph cell beside it', () => {
    // A slot ends one inset short of its last column; the glyph cell in the
    // next column starts its own inset in. The two never touch. An earlier
    // version added the card's padding to the slot and ran it 4px over.
    for (const [from, to] of [[1, 3], [1, 2]] as const) {
      const slot = L.slotX(from, to);
      expect(slot.left).toBe((from - 1) * L.COL + L.INX);
      expect(slot.left + slot.width).toBeLessThan(to * L.COL + L.RAIL);
    }
  });

  it('mirrors every band overhang across the picture', () => {
    // A band's corner curve ends on the rail, so the band begins one radius
    // left of it and its label lands on the rail. That overhang is mirrored
    // at the other end: the band sits the same distance in from each edge.
    const card = {
      left: L.FRAME + L.PADX + L.RAIL - L.BAND_R,
      right: L.FRAME + L.PADX + L.CARD_W - 2 * L.PADX - L.RAIL + L.BAND_R,
    };
    expect(L.CARD_IMG_W - card.right).toBeCloseTo(card.left, 6);
    expect(card.left).toBeGreaterThan(L.FRAME);
    const home = {
      left: L.HPADX + L.HOME_RAIL - L.HOME_R,
      right: L.HPADX + L.HOME_INNER - L.HOME_RAIL + L.HOME_R,
    };
    expect(L.HOME_W - home.right).toBeCloseTo(home.left, 6);
    expect(home.left).toBeGreaterThan(0);
    // The overhang is shorter than it would be at the old label padding.
    expect(L.BAND_R).toBeLessThan(8 * L.K);
    expect(L.HOME_R).toBeLessThan(8 * L.K2);
  });

  it('sets the home glyph cell three by two', () => {
    const inset = L.HOME_RAIL;
    const w = L.GLYPH_COL - 2 * inset;
    const h = L.ROW2 - 10 * L.K2;
    expect(w / h).toBeCloseTo(1.5, 1);
  });

  it('keeps both slot labels above the legibility floor', () => {
    expect(L.MARK_LABEL_PX).toBeGreaterThanOrEqual(12);
    expect(L.HEAD_PX).toBeGreaterThanOrEqual(12);
  });

  it('spans the home row across its glyph, type and seat columns', () => {
    expect(L.HOME_INNER).toBeCloseTo(L.GLYPH_COL + L.TYPE_COL + L.SEAT_COUNT * L.SEAT_COL, 6);
  });

  it('widens the picture when story and rematch export side by side', () => {
    const base = L.homeExportGeometry(false, false);
    const wide = L.homeExportGeometry(false, true);
    const teamBlock = L.SEAT_COUNT * L.SEAT_COL;
    expect(wide.homeW).toBeCloseTo(base.homeW + teamBlock + 2 * L.HOME_SIDE_GAP, 6);
    expect(wide.leadGap).toBe(L.HOME_SIDE_GAP);
    expect(wide.sideGap).toBe(L.HOME_SIDE_GAP);
    expect(wide.seatCol).toBe(base.seatCol);
  });

  it('widens the picture for gym details without shrinking seats', () => {
    const base = L.homeExportGeometry(false, false);
    const detailed = L.homeExportGeometry(true, false);
    expect(detailed.homeW).toBeCloseTo(base.homeW + L.HOME_DETAILS_COL + L.HOME_SIDE_GAP, 6);
    expect(detailed.leadGap).toBe(L.HOME_SIDE_GAP);
    expect(detailed.seatCol).toBe(base.seatCol);
  });

  it('keeps a uniform gap between details, story, and rematch', () => {
    const g = L.homeExportGeometry(true, true);
    expect(g.leadGap).toBe(L.HOME_SIDE_GAP);
    expect(g.sideGap).toBe(L.HOME_SIDE_GAP);
  });

  it('splits only the gym-leader band, with equal gaps and equal team pills', () => {
    const geom = L.homeExportGeometry(true, true);
    const gym = L.homeSectionPills(0, geom, 'GYM LEADERS', true);
    expect(gym).toHaveLength(3);
    const gap12 = gym[1].x - (gym[0].x + gym[0].w);
    const gap23 = gym[2].x - (gym[1].x + gym[1].w);
    expect(gap12).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gap23).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gym[1].w).toBeCloseTo(gym[2].w, 6);
    expect(gym[1].w).toBeCloseTo(geom.blockWidth, 6);

    for (const title of ['ELITE FOUR', 'CHAMPION', 'ENDGAME BOSS']) {
      const pills = L.homeSectionPills(0, geom, title, false);
      expect(pills).toHaveLength(1);
      expect(pills[0].w).toBeGreaterThan(geom.blockWidth * 2);
    }
  });

  it('pins vacancy copy to the rematch block in both-teams mode', () => {
    const geom = L.homeExportGeometry(true, true);
    const origin = L.homeTeamOriginX(0, geom);
    expect(L.homeVacancyAnchorX(0, geom, true)).toBeCloseTo(
      origin + 2 * geom.blockWidth + geom.sideGap,
      6,
    );
    expect(L.homeVacancyAnchorX(0, geom, false)).toBeCloseTo(origin + geom.blockWidth, 6);
  });

  it('gives gym details room for a 12-letter TM and a long theme', () => {
    const tmIcons =
      L.HOME_DETAIL_ICON +
      L.HOME_DETAIL_GAP +
      L.HOME_DETAIL_TYPE +
      L.HOME_DETAIL_GAP +
      L.HOME_DETAIL_CHIP_W +
      L.HOME_DETAIL_GAP;
    const twelveCaps = L.HOME_MARK_LABEL_PX * 7.2 + L.HOME_MARK_TRACK * 12;
    expect(L.HOME_DETAILS_COL).toBeGreaterThan(tmIcons + twelveCaps);
    const themeLabel = L.HOME_MARK_LABEL_PX * 5.2;
    const themeChars = L.HOME_THEME_TEXT_PX * 0.55 * 28;
    expect(L.HOME_DETAILS_COL).toBeGreaterThan(themeLabel + 5 * L.K2 + themeChars);
  });

  it('sets theme x-height just under the smallcaps cap height', () => {
    const themeXHeight = L.HOME_THEME_TEXT_PX * 0.53;
    const smallcapsCap = L.HOME_MARK_LABEL_PX * 0.72;
    expect(themeXHeight).toBeLessThan(smallcapsCap);
    expect(themeXHeight).toBeGreaterThan(smallcapsCap * 0.8);
  });

  it('keeps gym-detail marks inside one third of a row and square, not circular', () => {
    const bandH = (L.ROW2 - 2 * L.HOME_DETAIL_PAD_Y) / 3;
    expect(L.HOME_DETAIL_ICON).toBeLessThan(bandH);
    expect(L.HOME_DETAIL_TYPE).toBeLessThan(bandH);
    const radius = L.homeTypeMarkRadius(L.HOME_DETAIL_TYPE);
    expect(radius).toBeCloseTo(L.HOME_DETAIL_TYPE * (L.HOME_R / L.HOME_TYPE_MARK));
    expect(radius).toBeLessThan(L.HOME_DETAIL_TYPE * 0.35);
  });

  it('sets the credit at about six points on a phone', () => {
    // A 393pt-wide screen shows the picture fitted to its width.
    const onScreenPt = (L.CREDIT_PX / L.CARD_IMG_W) * 393;
    expect(onScreenPt).toBeGreaterThan(5.5);
    expect(onScreenPt).toBeLessThan(7);
    expect(L.CREDIT_PX * 1.5).toBeLessThan(L.FOOT);
  });

  it('keeps a twelve-letter move inside the TM box at its full size', () => {
    // "Flamethrower" and "Aromatherapy" are the longest single words in the
    // move data. At 0.6875rem in Inter a capital-led twelve-letter word runs
    // about 6.3 em, well inside the body once the mark column is paid for.
    const tm = L.slotX(1, 2);
    const body = tm.width - 3 * L.MARK_PAD - L.MARK_COL;
    expect(body).toBeGreaterThan(6.6 * L.MOVE_PX);
  });

  it('sets TM name and badge name at the ACE POKÉMON spacer size', () => {
    expect(L.MOVE_PX).toBe(L.HEAD_PX);
    expect(L.NAME_PX).toBe(L.HEAD_PX);
    expect(L.MOVE_MIN_PX).toBe(L.HEAD_PX);
  });

  it('keeps the TM type badge at the in-app 2.75rem width', () => {
    expect(L.TM_BADGE_W).toBeCloseTo(2.75 * 16 * L.K);
  });

  it('stacks the TM type badge and category above the move name', () => {
    expect(L.TM_TYPE_ABOVE_NAME).toBe(true);
  });

  it('paints ace/partner at a whole multiple of the 96px source', () => {
    // Team cells paint at 96. Ace/partner may be 1×, 2×, or 3× of that.
    // css×K (~118) is not an integer scale and aliases the 96px asset.
    const box = L.showcaseBox();
    const sprite = L.pairExportSprite(box.width, box.height);
    expect([96, 192, 288]).toContain(sprite);
    expect(sprite % 96).toBe(0);
    expect(sprite).not.toBe(Math.round(64 * L.K));
    const pad = 0.5 * 16 * L.K;
    const aceRight = pad + sprite;
    const partnerLeft = box.width - pad - sprite;
    expect(aceRight).toBeLessThanOrEqual(partnerLeft);
  });

  it('labels the showcase ACE POKÉMON, not SIGNATURE', () => {
    expect(L.ACE_HEAD).toEqual(['ACE', 'POKÉMON']);
    expect(L.ACE_HEAD.join(' ')).not.toMatch(/SIGNATURE/i);
  });

  it('exports badge and move names in the same caps as ACE POKÉMON', () => {
    expect(L.badgeExportPhrase('Marsh')).toBe('MARSH BADGE');
    expect(L.moveExportName('Psychic')).toBe('PSYCHIC');
  });

  it('pins ace and partner sprite centres as a 180° mirror', () => {
    const box = L.showcaseBox();
    const pad = 0.5 * 16 * L.K;
    const sprite = L.pairExportSprite(box.width, box.height);
    const head = 2 * L.HEAD_LINE;
    const aceCy = pad + head + sprite / 2;
    const partnerCy = box.height - pad - head - sprite / 2;
    expect(aceCy + partnerCy).toBeCloseTo(box.height);
  });

  it('names a vacancy for every slot kind', () => {
    expect(Object.keys(L.VACANCY).sort()).toEqual(['boss', 'champion', 'elite', 'gym']);
  });
});

function cardWith(over: Partial<GymCard>): GymCard {
  return { ...emptyCard(), ...over };
}

describe('reading a card for export', () => {
  it('reads no showcase from an empty card', () => {
    expect(showcasePair(emptyCard())).toEqual({ ace: null, partner: null });
  });

  it('reads the picked signature, not the line leaf', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 2,
    });
    expect(showcasePair(card)).toEqual({ ace: 2, partner: null });
  });

  it('falls back to the endgame member when nothing was picked', () => {
    const card = cardWith({ lines: [makePlacedLine([1, 2, 3])], signatureSeat: 1 });
    expect(showcasePair(card).ace).toBe(3);
  });

  it('reads the partner beside the ace', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      signatureSeat: 1,
      signatureId: 3,
      partnerId: 25,
    });
    expect(showcasePair(card)).toEqual({ ace: 3, partner: 25 });
  });

  it('gives every row the seats its team size allows', () => {
    const card = cardWith({ lines: [makePlacedLine([1, 2, 3])] });
    for (let row = 1; row <= L.ROW_COUNT; row++) {
      expect(exportRow(card, row)).toHaveLength([2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6][row - 1]);
    }
  });

  it('carries a legendary onto the endgame row only', () => {
    const card = cardWith({
      lines: [makePlacedLine([1, 2, 3])],
      legends: [{ pokemonId: 150, seat: 1 }],
    });
    expect(exportRow(card, L.BOSS_ROW).some((c) => c.pokemonId === 150)).toBe(true);
    expect(exportRow(card, L.CHAMPION_ROW).some((c) => c.pokemonId === 150)).toBe(false);
  });

  it('shows the dashed square for a seat with no Pokémon and no type', () => {
    // An open seat reads as the app shows it. A team with no type, or a type
    // with no team, is a choice someone made, and keeps its mark.
    expect(vacantRow(emptyCard())).toBe(true);
    expect(vacantRow(cardWith({ type: 'none' }))).toBe(true);
    expect(vacantRow(cardWith({ type: 'fire' }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])] }))).toBe(false);
    expect(vacantRow(cardWith({ lines: [makePlacedLine([1, 2, 3])], type: 'none' }))).toBe(false);
  });

  it('loads rematch sprites for every slot in both-teams mode', () => {
    const both = { ...DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT, teamMode: 'both' as const };
    expect(homeRowsForCard(0, 'challenge', both)).toEqual([1, L.BOSS_ROW]);
    expect(homeRowsForCard(8, 'challenge', both)).toEqual([L.ELITE_ROW, L.BOSS_ROW]);
    expect(homeRowsForCard(12, 'challenge', both)).toEqual([L.CHAMPION_ROW, L.BOSS_ROW]);
    expect(homeRowsForCard(13, 'challenge', both)).toEqual([L.BOSS_ROW, L.BOSS_ROW]);
  });

  it('gives a filled trainer a rematch team whenever it has a story team', () => {
    const cards = kantoCards();
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (card.lines.length === 0) continue;
      const story = exportRow(card, slotRow(i));
      const rematch = exportRow(card, L.BOSS_ROW);
      expect(story.some((c) => c.pokemonId != null), `slot ${i} story`).toBe(true);
      expect(rematch.some((c) => c.pokemonId != null), `slot ${i} rematch`).toBe(true);
    }
  });
});
