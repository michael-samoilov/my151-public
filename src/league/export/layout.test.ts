import { describe, expect, it } from 'vitest';
import * as L from './layout';
import { showcasePair, exportRow, vacantRow, homeRowsForCard } from './exportLeague';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import { DEFAULT_LEAGUE_HOME_EXPORT_LAYOUT } from './exportOptions';

/**
 * The export's geometry is arithmetic, not layout: nothing here reads the DOM,
 * so a drift shows up as a failing number rather than as a crooked picture
 * somebody has to notice. The card's own drawing is verified by rendering it
 * and diffing against the design canvas, which these numbers underwrite.
 */
describe('export layout', () => {
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

  it('splits every band at the same x in both-teams mode, with equal gaps and pills', () => {
    // At the narrowest details column, the title pill is as wide as a team pill.
    const geom = L.homeExportGeometry(true, true, 0);
    const gym = L.homeSectionPills(0, geom, 'GYM LEADERS', true, true);
    expect(gym).toHaveLength(3);
    const gap12 = gym[1].x - (gym[0].x + gym[0].w);
    const gap23 = gym[2].x - (gym[1].x + gym[1].w);
    expect(gap12).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gap23).toBeCloseTo(L.HOME_SIDE_GAP, 6);
    expect(gym[0].w).toBeCloseTo(geom.blockWidth, 6);
    expect(gym[1].w).toBeCloseTo(geom.blockWidth, 6);
    expect(gym[2].w).toBeCloseTo(geom.blockWidth, 6);

    for (const title of ['ELITE FOUR', 'CHAMPION', 'ENDGAME BOSS']) {
      const pills = L.homeSectionPills(0, geom, title, true, false);
      expect(pills.map((p) => [p.x, p.w])).toEqual(gym.map((p) => [p.x, p.w]));
      expect(pills.map((p) => p.label)).toEqual([title, null, null]);
    }
  });

  it('centers the TM type/name stack on the disc+label the way the live card flexes', () => {
    // CardGrid TmSlot: parent `flex items-center`; body is a column of
    // (type row `items-center` + 2px gap + NAME_CLASS). The type row's box
    // is the taller child — the category chip, not the 5:1 type badge.
    // NAME_CLASS is `leading-[1.4]`, so the name box is NAME_LINE.
    const badgeH = L.tmBadgeH();
    expect(L.TM_CHIP_H).toBeGreaterThan(badgeH);
    const typeRowH = Math.max(badgeH, L.TM_CHIP_H);
    const slotH = 1.5 * L.ROW - 2 * L.INY;
    const cy = slotH / 2;
    const body = L.tmMoveBody(cy);
    expect(body.height).toBeCloseTo(typeRowH + L.TM_STACK_GAP + L.NAME_LINE);
    expect(body.badgeY + badgeH / 2).toBeCloseTo(body.chipY + L.TM_CHIP_H / 2);
    expect(body.nameTop).toBeCloseTo(body.top + typeRowH + L.TM_STACK_GAP);
    expect(body.top).toBeGreaterThan(0);
    expect(body.top + body.height).toBeLessThan(slotH);
  });

  it('matches the type-badge→disc-top gap to the name-bottom→TM-bottom gap', () => {
    const { top, bottom } = L.tmInkGaps(100);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
  });

  it('grows the TM stack by one name line when a two-word name wraps', () => {
    const one = L.tmMoveBody(100, 1);
    const two = L.tmMoveBody(100, 2);
    expect(two.height - one.height).toBeCloseTo(L.NAME_LINE);
  });

  it('wraps a two-word TM name and leaves a one-word name on one line', () => {
    expect(L.tmNameWraps('Stomping Tantrum')).toBe(true);
    expect(L.tmNameWraps('Psychic')).toBe(false);
    expect(L.tmNameWraps('Self-Destruct')).toBe(false);
    expect(L.tmNameWraps('Power-Up Punch')).toBe(true);
  });
});

function cardWith(over: Partial<GymCard>): GymCard {
  return { ...emptyCard(), ...over };
}

describe('reading a card for export', () => {
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
});
