import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { HomePage } from '../components/home/HomePage';

export { LOCALES } from '../i18n/config';
export { SLOT_COUNT } from '../league/model/constants';
export { FAVORITES_NOTICE_END, FAVORITES_NOTICE_SEEN_KEY, FAVORITES_NOTICE_START } from '../lib/launchFlags';
export { RETURNING_KEYS } from '../lib/visitorAtBoot';

export function renderHub(): string {
  return renderToString(createElement(HomePage));
}

export { mobileArtwork as HOME_ARTWORK, MOBILE_MEDIA as HOME_MOBILE_MEDIA } from './artwork-data';
