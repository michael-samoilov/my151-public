

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
