/**
 * Adapted from poke-holo (pokemon-cards-css) by Simon Goellner, GNU GPL 3.0:
 * https://github.com/simeydotme/pokemon-cards-css. The "V" shine's layers, kept
 * apart with pokeHolo.css and pokeHoloPointer.ts so the independent redraw
 * never reads them. All three files leave the app once the redraw replaces them.
 */

export function HoloShineParts() {
  return (
    <>
      <span className="export-foil-holo-part export-foil-holo-radial" />
      <span className="export-foil-holo-part export-foil-holo-bands" />
      <span className="export-foil-holo-part export-foil-holo-pillars" />
      <span className="export-foil-holo-part export-foil-holo-grain" />
    </>
  );
}
