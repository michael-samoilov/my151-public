/** One equally weighted vote per valid occupied multi-option selector. Pointer votes never enter this API. */
interface ConditionalEntry { id:number; attributes:Readonly<Record<string,readonly string[]|undefined>> }
interface ConditionalPick { id:number; pool:readonly number[] }
interface ConditionalRow { key:string; count:number; expected:number; deviation:number|null }
interface ConditionalDimension { coveredChoices:number; excludedChoices:number; rows:ConditionalRow[] }
export function computeConditionalStats(entries:readonly ConditionalEntry[],picks:readonly ConditionalPick[],dimensions:readonly string[]) {
 const byId=new Map(entries.map(entry=>[entry.id,entry]));
 const valid=picks.flatMap(pick=>{const ids=[...new Set(pick.pool)];return ids.length>1&&ids.includes(pick.id)&&byId.has(pick.id)?[{id:pick.id,pool:ids}]:[];});
 const result:Record<string,ConditionalDimension>={};
 for(const dimension of dimensions){
  let coveredChoices=0;const observed=new Map<string,number>(),expected=new Map<string,number>();
  for(const pick of valid){
   const members=pick.pool.map(id=>byId.get(id)?.attributes[dimension]);
   if(members.some(value=>!value?.length))continue;
   coveredChoices++;
   for(const key of new Set(byId.get(pick.id)!.attributes[dimension]!))observed.set(key,(observed.get(key)??0)+1);
   for(const values of members)for(const key of new Set(values!))expected.set(key,(expected.get(key)??0)+1/pick.pool.length);
  }
  const keys=[...new Set([...observed.keys(),...expected.keys()])];
  result[dimension]={coveredChoices,excludedChoices:valid.length-coveredChoices,rows:keys.map(key=>{
   const count=observed.get(key)??0,reference=expected.get(key)??0;
   return {key,count,expected:reference,deviation:reference>0?100*(count/reference-1):null};
  })};
 }
 return {populationSize:valid.length,excludedSingletonOrInvalid:picks.length-valid.length,dimensions:result};
}
