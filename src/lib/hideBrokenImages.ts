/**
 * A failed image shows nothing, as an image that is still loading does,
 * instead of the browser's broken-image icon. If the same element loads later,
 * it shows again. `error` and `load` do not bubble, but a capturing listener on
 * the document receives them, so one pair of listeners covers every image.
 */
export function installHideBrokenImages(): void {
  const mark = (failed: boolean) => (event: Event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (failed) img.dataset.failed = '';
    else delete img.dataset.failed;
  };
  document.addEventListener('error', mark(true), true);
  document.addEventListener('load', mark(false), true);
}
