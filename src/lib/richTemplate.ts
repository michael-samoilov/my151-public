/**
 * Splits a message into literal runs and named slots, so a sentence containing
 * styled or graphical pieces can still be *one* translatable string.
 *
 * The poster's insight line used to be assembled from fragments —
 * `"Water"` + `"-forward"` + `" · "` + `"Fire"` + `" over-performs"` — with
 * type icons and per-type colours interleaved. That is unlocalisable: it hard-
 * codes English word order, and `-forward` is a suffix that exists in no other
 * language. Written instead as `'{types}-forward'` and `'{type} over-performs'`,
 * a translator can move the slot anywhere in the sentence, and the renderer
 * still knows where the icon and the coloured text go.
 *
 * Deliberately renderer-agnostic: `exportImage` maps the parts onto canvas
 * draw-segments, `IntroCard` maps them onto React nodes. Keeping one splitter
 * means the DOM and the exported PNG cannot disagree about word order.
 */

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

/**
 * Expand a template against a map of slot renderers, concatenating the results.
 *
 * A slot with no renderer emits its placeholder verbatim rather than vanishing
 * — a visible `{type}` gets reported; a silently missing subject does not.
 */
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
