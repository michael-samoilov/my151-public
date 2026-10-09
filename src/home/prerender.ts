import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { HomePage } from '../components/home/HomePage';

// The hub's server entry. `scripts/prerender-hub.ts` builds it at build time
// and writes its markup into dist/index.html, so the hub paints before its
// JavaScript arrives. The markup is a first-time English visitor's first
// render; the client hydrates it in src/home/main.tsx.
// The head script's inputs, from the same modules the client reads.
export { LOCALES } from '../i18n/config';
export { SLOT_COUNT } from '../league/model/constants';
export { FAVORITES_NOTICE_END, FAVORITES_NOTICE_SEEN_KEY, FAVORITES_NOTICE_START } from '../lib/launchFlags';
export { RETURNING_KEYS } from '../lib/visitorAtBoot';

export function renderHub(): string {
  return renderToString(createElement(HomePage));
}
