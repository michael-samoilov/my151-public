/**
 * The hover state of a control that is on. It lays the control's own text color over it at 8%, so
 * it darkens a light chip and lightens a dark one over any background. Tailwind's `hover:` applies
 * only where the pointer can hover, so a tap never leaves it showing.
 */
export const HOVER_LAYER = 'hover:[box-shadow:inset_0_0_0_100vmax_color-mix(in_srgb,currentColor_8%,transparent)]';
