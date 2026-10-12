// Adapted from poke-holo (pokemon-cards-css) by Simon Goellner, GNU GPL 3.0:
// https://github.com/simeydotme/pokemon-cards-css. Kept apart with pokeHolo.css
// and pokeHoloParts.tsx so the independent redraw never reads it.

/** poke-holo maps the pointer to 37-63% across and 33-67% down for the shine. */
export function setPokeHoloPointer(el: HTMLElement, pointerX: number, pointerY: number) {
  el.style.setProperty('--background-x', `${(37 + pointerX * 0.26).toFixed(2)}%`);
  el.style.setProperty('--background-y', `${(33 + pointerY * 0.34).toFixed(2)}%`);
}
