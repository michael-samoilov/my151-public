// keeps: fraction-versus-relative-index and zero-reference combinations are not covered by browser export fixtures.
import { it, expect } from 'vitest';
import { preferenceButterflyRows } from './butterflyRows';
it('converts population fractions to counts and relative indexing, not percentage points', () => {
 const rows=preferenceButterflyRows({observedCoverage:1,baselineCoverage:1,rows:[{key:'red',observed:0.5,baseline:0.25,deviation:0.25}]},8);
 expect(rows[0].count).toBe(4); expect(rows[0].deviation).toBe(100);
});
it('does not fabricate an index when baseline is zero or coverage is absent', () => {
 const rows=preferenceButterflyRows({observedCoverage:1,baselineCoverage:1,rows:[{key:'red',observed:0.25,baseline:0,deviation:0.25}]},8);
 expect(rows[0].count).toBe(2);expect(rows[0].deviation).toBeNull();
 const missing=preferenceButterflyRows({observedCoverage:0,baselineCoverage:1,rows:[{key:'red',observed:0,baseline:1,deviation:null}]},8);
 expect(missing[0].deviation).toBeNull();
});
it('retains the known-attribute denominator when coverage is partial', () => {
 const rows=preferenceButterflyRows({observedCoverage:0.5,baselineCoverage:1,rows:[{key:'red',observed:0.5,baseline:0.5,deviation:0}]},8);
 expect(rows[0].count).toBe(2);expect(rows[0].deviation).toBe(0);
});
