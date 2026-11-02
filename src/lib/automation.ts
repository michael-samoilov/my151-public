// platform: Playwright, Puppeteer, Selenium, and every W3C WebDriver client set navigator.webdriver, on any platform.
export const AUTOMATED: boolean = (() => {
  try {
    return typeof navigator !== 'undefined' && navigator.webdriver === true;
  } catch {
    return false;
  }
})();
