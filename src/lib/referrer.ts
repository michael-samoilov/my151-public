/**
 * The host of an EXTERNAL referrer, for a coarse acquisition source.
 *
 * `document.referrer` is the URL of the page that linked here. This returns
 * only its host, and only when that host is another site. A same-origin
 * referrer is internal navigation — the hub to a tool, or a reload — not
 * acquisition, so it returns ''. The host alone, never the path or query,
 * keeps a referring URL's personal data out of analytics, the same
 * low-sensitivity rule the server's geo capture follows.
 *
 * '' means "nothing to report": a direct visit, internal navigation, or a
 * referrer the browser withheld. The caller omits the field in that case.
 *
 * Both inputs are injectable so the unit test drives them without a DOM.
 */
export function externalReferrerHost(
  referrer: string = typeof document !== 'undefined' ? document.referrer : '',
  ownOrigin: string = typeof location !== 'undefined' ? location.origin : '',
): string {
  if (!referrer) return '';
  try {
    const url = new URL(referrer);
    if (ownOrigin && url.origin === ownOrigin) return '';
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}
