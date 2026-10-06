/** Shared SVG/canvas labels. Diamonds keep their exact coordinates on one rail. */
export function histogramMeans(
 yours: number,
 options: number,
 width: number,
 position: (value: number) => number,
 labels: { yours: string; options: string; exact: string },
 measure: (text: string) => number,
) {
 const compact = (value: number) => Number(value.toFixed(1)).toString();
 if (Math.abs(yours - options) < .000001) {
  const complete = `${labels.exact} ${compact(yours)}`;
  const text = measure(complete) <= width ? complete : compact(yours);
  const w = measure(text), x = position(yours);
  const labelX = Math.max(w / 2, Math.min(width - w / 2, x));
  return [{ value: yours, x, text, labelX, anchor: 'middle' as const, rail: 0,
   labelRail: 1, color: '#dc2626', exact: true }];
 }
 return [{ value: yours, color: '#ef4444', label: labels.yours },
  { value: options, color: '#94a3b8', label: labels.options }]
  .sort((a, b) => a.value - b.value)
  .map((point, index) => {
   const x = position(point.value), anchor = index === 0 ? 'end' as const : 'start' as const;
   const labelX = x + (index === 0 ? -7 : 7);
   const room = index === 0 ? labelX : width - labelX;
   const number = compact(point.value);
   const complete = index === 0 ? `${point.label} ${number}` : `${number} ${point.label}`;
   const text = measure(complete) <= room ? complete : number;
   // At a literal edge, move only the text to a bounded separate line.
   const fits = measure(text) <= room;
   return { ...point, x, text, anchor, rail: 0, exact: false,
    labelX: fits ? labelX : index === 0 ? measure(text) : width - measure(text),
    labelRail: fits ? 0 : index + 1 };
  });
}

/** Transparent stacked legend and reserved bar headroom, shared by SVG and canvas. */
export function histogramLegend(
 width: number,
 plotHeight: number,
 yDomain: number,
 maximum: number,
 labels: { yours: string; options: string },
 measure: (text: string) => number,
) {
 const textWidth = Math.max(1, width - 20);
 const wrap = (text: string) => {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
   if (current && measure(current + char) > textWidth) {
    const space = current.lastIndexOf(' ');
    if (space > 0) {
     lines.push(current.slice(0, space));
     current = current.slice(space + 1) + char;
    } else {
     lines.push(current.trimEnd());
     current = char.trimStart();
    }
   } else current += char;
  }
  if (current) lines.push(current.trimEnd());
  return lines;
 };
 let lineCount = 0;
 const items = [{ text: labels.options, color: '#94a3b8' }, { text: labels.yours, color: '#ef4444' }]
  .map(item => {
   const lines = wrap(item.text), y = lineCount * 15;
   lineCount += lines.length;
   return { ...item, lines, y };
  });
 const legendWidth = Math.min(width, Math.max(0, ...items.flatMap(item => item.lines.map(line => measure(line) + 20))));
 const headroom = 6 + lineCount * 15 + 8;
 return { items, x: Math.max(0, width - legendWidth), top: 6, headroom,
  yDomain: Math.max(yDomain, maximum * plotHeight / Math.max(1, plotHeight - headroom)) };
}
