export type TemplatePart =
  | { kind: 'literal'; text: string }
  | { kind: 'slot'; name: string };

const SLOT = /\{(\w+)\}/g;

export function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  SLOT.lastIndex = 0;
  while ((m = SLOT.exec(template)) !== null) {
    if (m.index > last) parts.push({ kind: 'literal', text: template.slice(last, m.index) });
    parts.push({ kind: 'slot', name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ kind: 'literal', text: template.slice(last) });
  return parts;
}

export function expandTemplate<T>(
  template: string,
  literal: (text: string) => T,
  slots: Record<string, () => T[]>,
): T[] {
  return splitTemplate(template).flatMap((part) =>
    part.kind === 'literal'
      ? [literal(part.text)]
      : (slots[part.name]?.() ?? [literal(`{${part.name}}`)]),
  );
}
