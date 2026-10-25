// Bars for rows with no colour of their own, such as generations and shapes.
export const CHART_BAR_RED = '#ef4444';

export interface ButterflyRow {
  key?: string;
  label: string;
  count: number;
  unavailable?: boolean;
  deviation: number;
  color: string;
  barStroke?: string;
  barOpacity?: number;
  icon?: string | ((x: number, y: number, size: number, colWidth: number) => React.ReactNode);
}

export function rowKey(row: ButterflyRow): string {
  return row.key ?? row.label;
}
