import type { ExtraTypeAxis } from '../model/cells';

/** Each extra column's badge takes the fill of its header icon's edge. */
export const AXIS_FILL: Record<ExtraTypeAxis, string | readonly (readonly [number, string])[]> = {
  starter: '#dc2626',
  gimmick: [[0, '#d27a22'], [0.22, '#b8941a'], [0.42, '#4f9a3a'], [0.62, '#2a86c2'], [0.8, '#6a4fc0'], [1, '#c0357f']],
  legendary: [[0, '#1e1b4b'], [0.35, '#4338ca'], [0.65, '#7c3aed'], [1, '#be185d']],
  favorite: [[0, '#7a5410'], [0.3, '#b8861f'], [0.5, '#caa033'], [0.7, '#a8781c'], [1, '#6e4a0c']],
};

/** With no symbol, the word centres on the badge, with the type badge's margins. */
export const AXIS_TEXT_CENTER_X = 100;
export const AXIS_TEXT_WIDTH = 200 - 2 * 22;
