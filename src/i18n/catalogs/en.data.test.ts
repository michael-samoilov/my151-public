import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@/data/archetypes';
import { CATEGORIES } from '@/data/categories';
import { REGIONAL_DEXES } from '@/data/regional-dexes';
import { BUILD_GROUPS } from '@/data/slot-template';
import {
  archetypeDescription,
  archetypeName,
  archetypeSubgroupLabel,
  categoryColumnLabel,
  categoryName,
  categorySubgroupLabel,
  regionName,
  sectionName,
} from '../dataLabels';

/**
 * en.data.ts is generated from the data modules, and dataLabels.ts reads it
 * back by concatenating ids into keys — which TypeScript cannot check, because
 * these ids are plain strings rather than const unions.
 *
 * This is what buys that back. It asserts both directions:
 *   - every id in every collection resolves to a message (no raw keys on screen)
 *   - every message still equals the data field it came from (no stale copy)
 *
 * So editing a name in a data module without running `npm run i18n:data` fails
 * here, instead of silently shipping the old wording to eight other languages.
 */
describe('generated data catalog matches its sources', () => {
  it('covers every build section', () => {
    for (const g of BUILD_GROUPS) {
      expect(sectionName(g.id), `section.${g.id}`).toBe(g.name);
    }
  });

  it('covers every category, subgroup and dual column', () => {
    for (const c of CATEGORIES) {
      expect(categoryName(c.id), `category.${c.id}`).toBe(c.name);
      c.subgroups?.forEach((s, i) => {
        expect(categorySubgroupLabel(c.id, i), `category.${c.id}.sub.${i}`).toBe(s.label);
      });
      if (c.dualColumns) {
        expect(categoryColumnLabel(c.id, 'left')).toBe(c.dualColumns.left.label);
        expect(categoryColumnLabel(c.id, 'right')).toBe(c.dualColumns.right.label);
      }
    }
  });

  it('covers every archetype, description and subgroup', () => {
    for (const a of ARCHETYPES) {
      expect(archetypeName(a.id), `archetype.${a.id}`).toBe(a.name);
      expect(archetypeDescription(a.id), `archetype.${a.id}.desc`).toBe(a.description);
      a.subgroups?.forEach((s, i) => {
        expect(archetypeSubgroupLabel(a.id, i), `archetype.${a.id}.sub.${i}`).toBe(s.label);
      });
    }
  });

  it('covers every regional dex', () => {
    for (const d of REGIONAL_DEXES) {
      expect(regionName(d.id), `region.${d.id}`).toBe(d.name);
    }
  });

  it('resolves an unknown id to the key rather than to empty text', () => {
    // Visible beats blank: a raw key gets reported, an empty heading doesn't.
    expect(sectionName('does-not-exist')).toBe('section.does-not-exist');
  });
});
