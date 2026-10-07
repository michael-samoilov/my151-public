// keeps: selector-weighted repeated votes, forced pools and asymmetric metadata loss need pure multidimensional verification.
import { expect, it } from 'vitest';
import { computeConditionalStats } from './conditionalStats';
const entries = [
 { id:1, attributes:{type:['fire','flying'],color:['red']} },
 { id:2, attributes:{type:['fire'],color:['blue']} },
 { id:3, attributes:{type:['water'],color:['blue']} },
 { id:4, attributes:{type:['water'],color:undefined} },
];
it('counts each choice independently, deduplicates candidate IDs and preserves neutral guaranteed membership',()=>{
 const stats=computeConditionalStats(entries,[{id:1,pool:[1,1,2]},{id:1,pool:[1,3]},{id:3,pool:[3]}],['type','color']);
 expect(stats.populationSize).toBe(2);
 const fire=stats.dimensions.type.rows.find(row=>row.key==='fire')!;
 expect(fire.count).toBe(2);expect(fire.expected).toBe(1.5);expect(fire.deviation).toBeCloseTo(100/3);
 const flying=stats.dimensions.type.rows.find(row=>row.key==='flying')!;
 expect(flying.count).toBe(2);expect(flying.expected).toBe(1);expect(flying.deviation).toBe(100);
});
it('drops incomplete pools symmetrically only for their affected dimension',()=>{
 const stats=computeConditionalStats(entries,[{id:1,pool:[1,4]}],['type','color']);
 expect(stats.dimensions.type.coveredChoices).toBe(1);
 expect(stats.dimensions.color.coveredChoices).toBe(0);
 expect(stats.dimensions.color.excludedChoices).toBe(1);
 expect(stats.dimensions.color.rows).toEqual([]);
});
it('ignores invalid selections, empty pools and singletons without nonfinite output',()=>{
 const stats=computeConditionalStats(entries,[{id:1,pool:[]},{id:2,pool:[1,3]},{id:1,pool:[1]}],['type']);
 expect(stats.populationSize).toBe(0);expect(stats.dimensions.type.rows).toEqual([]);
});
