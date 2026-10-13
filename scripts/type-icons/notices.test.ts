// keeps: THIRD_PARTY_NOTICES.md naming types the icon build no longer takes from a source; no E2E reads that file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderNotices } from './notices';

describe('THIRD_PARTY_NOTICES.md type icon lines', () => {
  it('name the types selections.json takes from each source', () => {
    const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
    const selections = JSON.parse(readFileSync('scripts/type-icons/selections.json', 'utf8'));
    expect(renderNotices(notices, selections), 'run: npx tsx scripts/type-icons/notices.ts --write').toBe(notices);
  });
});
