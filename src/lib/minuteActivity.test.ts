// keeps: API history validation and cutoff math are unreachable through stubbed E2E routes.
import {describe,it,expect} from 'vitest';
import {parseMinuteActivity,reconstructMinuteActivity} from '../../api/_minuteActivity';
const t=Date.UTC(2026,9,10), m=60_000;
const batch={id:'batch-0001',tab:'tab-00001',day:'2026-10-10',buckets:[{run:'run-00001',first:t,last:t+59_000}]};
describe('minute facts validation',()=>{
 it('rejects forged capture dates, cross-minute spans, reversed endpoints, future clocks and expired history',()=>{
  for(const bad of [{...batch,day:'2026-10-09'},{...batch,buckets:[{run:'run-00001',first:t,last:t+m}]},{...batch,buckets:[{run:'run-00001',first:t+1,last:t}]}])expect(parseMinuteActivity({v:1,batches:[bad]},t+m)).toBeNull();
  expect(parseMinuteActivity({v:1,batches:[batch]},t-6*m)).toBeNull();
  expect(parseMinuteActivity({v:1,batches:[batch]},t+401*86400_000)).toBeNull();
 });
 it('keeps valid zero-duration activity without requiring optional history',()=>{
  expect(parseMinuteActivity({v:1,batches:[{...batch,buckets:[{run:'run-00001',first:t,last:t}]}]},t)?.batches).toHaveLength(1);
 });
});
describe('cutoff independent reconstruction',()=>{
 const stored=(buckets: typeof batch.buckets,tab=batch.tab)=>({...batch,cid:'browser-1',tool:'dex' as const,receivedAt:t+10*m,tab,buckets});
 it('reconnects minute fragments but never counts hidden gaps as time',()=>{
  const facts=[stored([{run:'run-00001',first:t,last:t+59_000},{run:'run-00001',first:t+m,last:t+m+10_000},{run:'run-00002',first:t+2*m,last:t+2*m+10_000}])];
  expect(reconstructMinuteActivity(facts,m)).toMatchObject({sessions:1,totalMs:80_000});
 });
 it('unions overlap across tabs, preserves point sessions and splits exact-cutoff gaps',()=>{
  const facts=[stored([{run:'run-00001',first:t,last:t+59_000}]),stored([{run:'run-00002',first:t+20_000,last:t+40_000},{run:'run-00003',first:t+119_000,last:t+119_000}],'tab-00002')];
  expect(reconstructMinuteActivity(facts,m)).toMatchObject({sessions:2,totalMs:59_000});
  expect(reconstructMinuteActivity(facts,5*m)).toMatchObject({sessions:1,totalMs:59_000});
 });
 it('coalesces retry fragments without double counting and rejects unsupported cutoffs',()=>{
  const b=stored(batch.buckets);
  expect(reconstructMinuteActivity([b,b],m).totalMs).toBe(59_000);
  expect(()=>reconstructMinuteActivity([b],m-1)).toThrow();
 });
});
