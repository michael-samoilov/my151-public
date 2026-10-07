export interface MeanRun { text: string; bold: boolean }
export interface HistogramTextMetrics { width: number; left: number; right: number; ascent: number; descent: number }
export type HistogramMeasure = (text: string, bold?: boolean, middle?: boolean) => HistogramTextMetrics;
/** Shared SVG/canvas annotation geometry. Every diamond stays at its true x on one rail. */
export function histogramMeans(
 yours: number, options: number, width: number, position: (value: number) => number,
 labels: { yours: string; options: string; exact: string }, measure: HistogramMeasure,
 bounds = { left: 0, right: width },
) {
 const compact = (value: number) => Number(value.toFixed(1)).toString();
 const extent = (runs: MeanRun[]) => runs.reduce((sum, run) => sum + measure(run.text, run.bold).width, 0);
 const numberRun = (value: number): MeanRun => ({ text: compact(value), bold: true });
 if (Math.abs(yours - options) < .000001) {
  let runs = [{ text: `${labels.exact} `, bold: false }, numberRun(yours)];
  if (extent(runs) > bounds.right - bounds.left) runs = [numberRun(yours)];
  const w = extent(runs), x = position(yours);
  return [{ value: yours, x, runs, width: w, text: runs.map(run => run.text).join(''),
   labelX: Math.max(bounds.left + w / 2, Math.min(bounds.right - w / 2, x)),
   anchor: 'middle' as const, rail: 0, labelRail: 1, color: '#dc2626', exact: true }];
 }
 return [{ value: yours, color: '#ef4444', label: labels.yours }, { value: options, color: '#94a3b8', label: labels.options }]
  .sort((a, b) => a.value - b.value).map((point, index) => {
   const x = position(point.value), anchor = index === 0 ? 'end' as const : 'start' as const;
   const labelX = x + (index === 0 ? -7 : 7), room = index === 0 ? labelX - bounds.left : bounds.right - labelX;
   let runs = index === 0 ? [{ text: `${point.label} `, bold: false }, numberRun(point.value)] : [numberRun(point.value), { text: ` ${point.label}`, bold: false }];
   if (extent(runs) > room) runs = [numberRun(point.value)];
   const w = extent(runs), fits = w <= room;
   return { ...point, x, runs, width: w, text: runs.map(run => run.text).join(''), anchor, rail: 0, exact: false,
    labelX: fits ? labelX : index === 0 ? bounds.left + w : bounds.right - w, labelRail: fits ? 0 : index + 1 };
  });
}
/** Measure the annotation height and only interrupt connectors where an x tick has ink. */
export function histogramMeanLayout(
 means: ReturnType<typeof histogramMeans>, ticks: number[], position: (value: number) => number,
 measure: HistogramMeasure,
) {
 const rail = 34;
 const tickBoxes = ticks.map(value => {
  const metrics = measure(String(value)), x = position(value);
  return { left: x - metrics.width / 2 - metrics.left, right: x - metrics.width / 2 + metrics.right,
   top: 15 - metrics.ascent, bottom: 15 + metrics.descent };
 });
 const bottom = Math.ceil(Math.max(rail + 4, ...means.map(point => rail + point.labelRail * 17 +
  Math.max(...point.runs.map(run => measure(run.text, run.bold, true).descent), 6))) + 4);
 return { rail, bottom, points: means.map(point => {
  let segments: [number, number][] = [[0, rail - 4]];
  for (const box of tickBoxes) {
   if (point.x < box.left - .5 || point.x > box.right + .5) continue;
   const from = box.top - 1, to = box.bottom + 1;
   segments = segments.flatMap(([start, end]) => to <= start || from >= end ? [[start, end] as [number, number]] :
    [[start, Math.min(end, from)], [Math.max(start, to), end]].filter(([a, b]) => b > a) as [number, number][]);
  }
  return { ...point, segments };
 }) };
}
