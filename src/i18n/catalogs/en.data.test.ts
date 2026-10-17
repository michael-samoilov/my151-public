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
});
