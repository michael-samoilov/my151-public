import type { ReactNode } from 'react';

/**
 * A translation with one placeholder swapped for a node, such as a link.
 * Translate with the placeholder's value set to `\u0000`, then pass the text
 * here: `withNode(t('ack.termsOf', { source: '\u0000' }), <Link />)`.
 */
export function withNode(text: string, node: ReactNode): ReactNode {
  const [before, after] = text.split('\u0000');
  return <>{before}{node}{after}</>;
}
