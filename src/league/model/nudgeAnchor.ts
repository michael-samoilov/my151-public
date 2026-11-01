/**
 * Bring a tip slot and the toolbar above it on-screen without panning the mobile
 * two-pane track. Each mobile pane scrolls, toolbar included, and the slot sits
 * directly under that toolbar, so the pane goes back to its top. A
 * `scrollIntoView({ inline: "nearest" })` would treat the 200%-wide track as a
 * horizontal scroller, slide the card pane in, and park Export over the league name.
 */
export function revealTipSlot(slot: Element): void {
  const pane = slot.closest('[data-lg-viewport]');
  if (pane instanceof HTMLElement && pane.scrollTop > 0) pane.scrollTop = 0;
  const track = document.querySelector('.p151-pane-track');
  const scroller = track?.parentElement;
  if (scroller) scroller.scrollLeft = 0;
}
