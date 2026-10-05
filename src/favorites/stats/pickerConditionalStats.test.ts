// keeps: actual catalog form BST collisions, dual types and frozen selector baselines are not covered by export-flow browser assertions.
import { expect, it } from 'vitest';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { pickerConditionalStats } from './pickerConditionalStats';
import formBst from '../data/formBst.json';
it('uses exact sourced battle-form values, with unknown gender variants explicit',()=>{
 expect(formBst[10008]).toBe(520);expect(formBst[10017]).toBe(540);expect(formBst[11004]).toBe(650);expect(formBst[888]).toBe(660);
 expect((formBst as Record<number,number>)[11067]).toBeUndefined();
});
it('ignores pointers/singletons and uses actual Fire1 choices, preserving dual-type membership',()=>{
 const stats=pickerConditionalStats(buildFavoritesSnapshot({'fire|1':6,'ghost|2':200,'favorite|1':6}));
 expect(stats.populationSize).toBe(1);
 const fire=stats.dimensions.type.rows.find(row=>row.key==='fire')!;
 const flying=stats.dimensions.type.rows.find(row=>row.key==='flying')!;
 expect(fire.count).toBe(1);expect(fire.expected).toBeCloseTo(1);expect(fire.deviation).toBeCloseTo(0);
 expect(flying.count).toBe(1);expect(flying.expected).toBeCloseTo(1/6);expect(flying.deviation).toBeCloseTo(500);
 expect(stats.bst.merged.reduce((sum,row)=>sum+row.yoursPct,0)).toBeCloseTo(100);
 expect(stats.bst.merged.reduce((sum,row)=>sum+row.nationalPct,0)).toBeCloseTo(100);
});
it('folds babies into Basic without dropping choices and retains candidate extreme histogram mass',()=>{
 const stats=pickerConditionalStats(buildFavoritesSnapshot({'electric|2':172,'poison|8':10190}));
 expect(stats.dimensions.evolution.rows.some(row=>row.key==='baby')).toBe(false);
 expect(stats.dimensions.evolution.rows.find(row=>row.key==='basic')?.count).toBeGreaterThan(0);
 expect(stats.bst.xDomain[1]).toBeGreaterThanOrEqual(1150);
 const empty=pickerConditionalStats(buildFavoritesSnapshot({}));expect(empty.bst.xDomain).toEqual([0,100]);expect(empty.bst.merged).toEqual([]);
});
