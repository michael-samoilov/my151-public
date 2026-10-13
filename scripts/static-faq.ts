/**
 * Writes each tool page's "About this tool" FAQ into its served HTML.
 *
 * The app renders the FAQ with React under the page footer, so a crawler that
 * does not run JavaScript never saw it: most AI crawlers, and Bing in part.
 * This plugin replaces a `<!-- p151-faq:<page> -->` marker in the page's HTML
 * with the same English copy from the catalog, so the two can never drift.
 *
 * The marker sits inside the page's boot copy (`.p151-copy`, `.lg-copy` or
 * `.fv-copy`). That block stays at opacity 0 for the first second and React
 * replaces it on mount, so a normal load never paints the served FAQ. A load
 * slower than a second shows it as one collapsed "About this tool" line.
 */
import type { Plugin } from 'vite';
import { en } from '../src/i18n/catalogs/en';
import { FAQ_KEYS, type FaqPage } from '../src/components/shared/faqKeys';

const MARKER = /<!--\s*p151-faq:([a-z]+)\s*-->/g;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function staticFaqMarkup(page: FaqPage): string {
  const items = FAQ_KEYS[page]
    .map(([q, a]) => `<section><h2>${escapeHtml(en[q])}</h2><p>${escapeHtml(en[a])}</p></section>`)
    .join('');
  return `<details class="p151-faq"><summary>${escapeHtml(en['faq.summary'])}</summary><div>${items}</div></details>`;
}

export function staticFaq(): Plugin {
  return {
    name: 'static-faq',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        return html.replace(MARKER, (_, page: string) => {
          if (!(page in FAQ_KEYS)) throw new Error(`static-faq: unknown FAQ page "${page}" in ${ctx.filename}`);
          return staticFaqMarkup(page as FaqPage);
        });
      },
    },
  };
}
