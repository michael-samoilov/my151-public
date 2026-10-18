/** True in a browser that automation drives. Playwright, Puppeteer, Selenium,
 *  and every W3C WebDriver client set `navigator.webdriver`, on any platform.
 *  Each beacon carries this as `auto`, and the server stores nothing for it.
 *  The page sends the same requests either way, so a speed test still measures
 *  what people get. This is the one shipped file that names the flag
 *  (scripts/check-speed-test-detection.mjs). */
export const AUTOMATED: boolean = (() => {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true;
  } catch {
    return false;
  }
})();
