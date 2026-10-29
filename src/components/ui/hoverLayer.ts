/**
 * The hover state of a control that is on. Black at 8% over the fill scales its red, green, and blue
 * evenly, so every fill turns a darker shade of its own hue, whatever its text color or background.
 * Tailwind's `hover:` applies only where the pointer can hover, so a tap never leaves it showing.
 */
export const HOVER_LAYER = 'hover:[box-shadow:inset_0_0_0_100vmax_rgb(0_0_0/0.08)]';
