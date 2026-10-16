import { getPickerMon } from './catalog';
import { isTypeName, parseCellKey } from './cells';

export function savedTypeRepairs(fills: Readonly<Record<string, number>>) {
  return Object.entries(fills).flatMap(([key, id]) => {
    const cell = parseCellKey(key);
    const mon = getPickerMon(id);
    return cell && cell.gen === 'gimmick' && isTypeName(cell.type)
      && mon?.source === 'powerup' && !mon.types.includes(cell.type)
      ? [{ ...cell, key, id }] : [];
  });
}
