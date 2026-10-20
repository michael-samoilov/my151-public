import type { AlternatePickerForm } from '@/favorites/model/alternateForms';

const TEMPORARY_FORM_IDS = new Set([
  10013, 10014, 10015, 10017, 10018, 10026, 10117, 10120, 10127,
  10136, 10137, 10138, 10139, 10140, 10141, 10142, 10143, 10157,
  10182, 10183, 10185, 10187, 10190, 10276, 10277, 11004, 11072,
  11105, 11106, 11107, 11108, 11109, 11110, 11111,
  11113, 11114, 11115, 11116,
  11112,
]);
const FUSION_FORM_IDS = new Set([10022, 10023, 10155, 10156, 10193, 10194]);
/**
 * Picker-only appearances from spin-off games, Pokopia, and battle or ride
 * looks. Michael, 2026-10-20: "for now, we can keep off all of these
 * spinoff-game etc. pokemon forms from the league builder."
 */
const PICKER_ONLY_FORM_IDS = new Set([
  11117, 11118, 11119, 11120, 11121, 11122, 11123, 11124, 11125, 11126, 11127,
]);

export const isLeagueAlternateForm = (form: AlternatePickerForm): boolean =>
  form.source !== 'powerup' && form.id !== 10191
  && form.ownerId !== 201
  && !TEMPORARY_FORM_IDS.has(form.id) && !FUSION_FORM_IDS.has(form.id)
  && !PICKER_ONLY_FORM_IDS.has(form.id);

export const STANDALONE_FORM_IDS = new Set([
  10080, 10081, 10082, 10083, 10084, 10085,
  10094, 10095, 10096, 10097, 10098, 10099, 10148, 10160,
  10061, 10272, 11064,
]);

export const FORM_PARENT_IDS: Readonly<Record<number, number | null>> = {
  902: 10247, 416: 11094,
  11008: null, 11009: null, 11010: null,
  11011: 11008, 11012: 11009, 11013: 11010,
  11065: null, 11066: 11065,
  11067: null, 11068: 11067,
  11069: null, 11070: 11069,
  11082: null, 11083: null, 11084: null, 11085: null,
  11086: 11082, 11087: 11083, 11088: 11084, 11089: 11085,
  11090: 11086, 11091: 11087, 11092: 11088, 11093: 11089,
  10016: null, 10247: null, 10248: 10247, 11094: null,
};

export const ADDITIONAL_EVOLUTION_EDGES: readonly (readonly [number, number])[] = [[10263, 1000]];
