// platform: `scrollIntoView({ inline: "nearest" })` treats the 200%-wide mobile track as a horizontal scroller and slides the card pane in.
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
