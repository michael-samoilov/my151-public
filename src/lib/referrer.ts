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
