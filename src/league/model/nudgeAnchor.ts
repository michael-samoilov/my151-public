/**
 * Bring a toolbar Export button on-screen without panning the mobile
 * two-pane track. `scrollIntoView({ inline: "nearest" })` treats that
 * 200%-wide track as a horizontal scroller, which slides the card pane
 * in and parks Export over the league name.
 */
export function revealToolbarButton(el: Element): void {
  const pane = el.closest('[data-lg-viewport]');
  if (pane instanceof HTMLElement) {
    const pr = pane.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < pr.top) pane.scrollTop += er.top - pr.top - 8;
    else if (er.bottom > pr.bottom) pane.scrollTop += er.bottom - pr.bottom + 8;
  }
  const track = document.querySelector('.p151-pane-track');
  const scroller = track?.parentElement;
  if (scroller) scroller.scrollLeft = 0;
}
