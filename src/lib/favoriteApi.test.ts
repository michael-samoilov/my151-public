import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../../api/_vercel';
const mocks=vi.hoisted(()=>({hget:vi.fn(),eval:vi.fn(),hincrby:vi.fn(),limit:vi.fn(),readOnly:vi.fn()}));
vi.mock('@upstash/ratelimit',()=>({Ratelimit:class{static fixedWindow(){return{};}limit=mocks.limit;}}));
vi.mock('../../api/_shared',()=>({redis:{hget:mocks.hget,eval:mocks.eval,hincrby:mocks.hincrby},MAX_CLIENTS:50_000,parseClientId:(v:unknown)=>v,bodyTooLarge:()=>false,admitNewClient:async()=>true,noteNewClient:async()=>undefined,
 getNetworkKey:()=> 'network',getGeo:()=>({country:'US'}),getClient:()=>({device:'Mobile',os:'iOS',browser:'Safari'}),getLang:()=> 'en',
 isReadOnlyDeployment:mocks.readOnly,parseLocale:(v:unknown)=>v,parseReferrerHost:()=>undefined}));
import handler from '../../api/favorites';
const body=()=>({cid:'browser-0001',id:'request-00001',kind:'progress',snapshot:{v:1,fills:{'water|1':7,'favorite|1':7}},ts:Date.now()});
async function invoke(b:unknown){const json=vi.fn();const status=vi.fn(()=>({json}));await handler({method:'POST',body:b,headers:{}} as VercelRequest,{status,setHeader:vi.fn()} as unknown as VercelResponse);return {status,json};}
beforeEach(()=>{vi.clearAllMocks();mocks.hget.mockResolvedValue(null);mocks.eval.mockResolvedValue(1);mocks.limit.mockResolvedValue({success:true});mocks.readOnly.mockReturnValue(false);});
describe('favorites endpoint failure guards',()=>{
 it('does not write excluded preview or opted-out traffic',async()=>{mocks.readOnly.mockReturnValue(true);await invoke(body());expect(mocks.limit).not.toHaveBeenCalled();expect(mocks.eval).not.toHaveBeenCalled();mocks.readOnly.mockReturnValue(false);await invoke({...body(),notme:true});expect(mocks.eval).not.toHaveBeenCalled();});
 it('rejects forged completion and unsupported export modes before Redis',async()=>{expect((await invoke({...body(),kind:'completion'})).status).toHaveBeenCalledWith(400);expect((await invoke({...body(),kind:'export',exportKind:'portrait'})).status).toHaveBeenCalledWith(400);expect(mocks.eval).not.toHaveBeenCalled();});
 it('rejects absent or future capture timestamps instead of overwriting the current board at arrival time',async()=>{
  expect((await invoke({...body(),ts:undefined})).status).toHaveBeenCalledWith(400);
  expect((await invoke({...body(),ts:Date.now()+86_400_000})).status).toHaveBeenCalledWith(400);
  expect(mocks.eval).not.toHaveBeenCalled();
 });
 it('stores valid board and derived milestones together, and passes retry dedupe to the atomic write',async()=>{await invoke(body());const call=mocks.eval.mock.calls[0];expect(call[1]).toContain('favorites:request:browser-0001:request-00001');const record=JSON.parse(call[2][2]);expect(record.latest.filled).toBe(2);expect(record.latest.uniqueIds).toEqual([7]);expect(record.country).toBe('US');const events=JSON.parse(call[2][4]);expect(events.map((e:{ev:string})=>e.ev)).toEqual(['favorites-open','favorites-first-pick']);});
 it('records a successful simplified export without a separate non-atomic event write',async()=>{await invoke({...body(),kind:'export',exportKind:'simplified'});const record=JSON.parse(mocks.eval.mock.calls[0][2][2]);expect(record.exportsSimplified).toBe(1);expect(record.exportsFull).toBe(0);expect(mocks.hincrby).not.toHaveBeenCalled();});
 it('retries contention and acknowledges duplicate requests without repeated writes',async()=>{mocks.eval.mockResolvedValueOnce(0).mockResolvedValueOnce(2);await invoke(body());expect(mocks.eval).toHaveBeenCalledTimes(2);expect(mocks.hincrby).not.toHaveBeenCalled();});
 it('acknowledges a capped store and records the drop',async()=>{mocks.eval.mockResolvedValue(3);const result=await invoke(body());expect(result.json).toHaveBeenCalledWith({ok:true,capped:true});expect(mocks.hincrby).toHaveBeenCalledWith('funnel','favorites-drop:cap',1);});
});
