// platform: Image error and load events do not bubble, but a capturing listener on the document receives them.
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
