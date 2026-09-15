declare module 'venn.js' {
  export interface VennArea {
    sets: string[];
    size: number;
  }
  export interface VennCircle {
    x: number;
    y: number;
    radius: number;
  }
  export function venn(areas: VennArea[]): Record<string, VennCircle>;
  export function normalizeSolution(
    circles: Record<string, VennCircle>,
    orientation?: number,
  ): Record<string, VennCircle>;
  export function scaleSolution(
    solution: Record<string, VennCircle>,
    width: number,
    height: number,
    padding: number,
  ): Record<string, VennCircle>;
}
