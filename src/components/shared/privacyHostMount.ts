import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivacyPanelHost } from './PrivacyPanel';

export function mountPrivacyHost(): void {
  const node = document.createElement('div');
  node.dataset.privacyHost = '';
  document.body.append(node);
  createRoot(node).render(createElement(PrivacyPanelHost));
}
