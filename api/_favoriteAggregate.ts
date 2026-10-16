import {buildDepthCurve} from './_aggregate.js';
import {FAVORITE_TOTAL_CELLS, parseFavoriteSnapshot, type FavoriteRecord} from './_favoriteRecord.js';
import cellData from './_favoriteCells.json' with {type: 'json'};
import speciesData from './_favoriteSpecies.json' with {type: 'json'};
export interface FavoriteUsageFunnel {
  opened: number;
  buckets: {label:string;count:number;exports:{full:number;simplified:number;both:number};notExported:number}[];
}
export function favoriteUsageFunnel(records: FavoriteRecord[]): FavoriteUsageFunnel {
  const buckets = [
    {label:'Not started',min:0,max:0},
    {label:'1–64 cells',min:1,max:64},
    {label:'65–128 cells',min:65,max:128},
    {label:'129–192 cells',min:129,max:192},
    {label:'193–256 cells',min:193,max:256},
    {label:'Completed',min:FAVORITE_TOTAL_CELLS,max:FAVORITE_TOTAL_CELLS},
  ].map(({label,min,max}) => {
    const rows = records.filter(r=>r.maxFilled >= min && r.maxFilled <= max);
    const full = rows.filter(r=>r.exportsFull>0 && r.exportsSimplified===0).length;
    const simplified = rows.filter(r=>r.exportsSimplified>0 && r.exportsFull===0).length;
    const both = rows.filter(r=>r.exportsFull>0 && r.exportsSimplified>0).length;
    return {label,count:rows.length,exports:{full,simplified,both},notExported:rows.length-full-simplified-both};
  });
  return {opened:records.length,buckets};
}
export function favoriteSummary(records: FavoriteRecord[]) {
  return {
    users:records.length,
    started:records.filter(r=>r.maxFilled>0).length,
    completed:records.filter(r=>r.maxFilled===FAVORITE_TOTAL_CELLS).length,
    exporters:records.filter(r=>r.exportsFull+r.exportsSimplified>0).length,
    exportsFull:records.reduce((n,r)=>n+r.exportsFull,0),
    exportsSimplified:records.reduce((n,r)=>n+r.exportsSimplified,0),
    depth:buildDepthCurve(records.filter(r=>r.maxFilled>0).map(r=>r.maxFilled)),
    unique:buildDepthCurve(records.filter(r=>r.maxFilled>0).map(r=>r.latest.uniqueIds.length)),
  };
}
const byCharts = (a:[number,number], b:[number,number]) => b[1]-a[1] || a[0]-b[0];
export interface FavoritePicks {
  preference?: FavoritePreference;
  /** Charts with at least one filled cell. */
  charts: number;
  /** Per cell key, each Pokémon a chart holds there and how many charts hold it. Never a count of 0. */
  cells: Record<string,[number,number][]>;
  /** The nine Pokémon the most charts hold in any cell, each chart counted once. */
  top: [number,number][];
}
export function favoritePicks(records: FavoriteRecord[]): FavoritePicks {
  const cells = new Map<string,Map<number,number>>();
  const charts = new Map<number,number>();
  let filled = 0;
  for (const r of records) {
    const fills = Object.entries(r.latest.fills);
    if (fills.length > 0) filled++;
    for (const [key,id] of fills) {
      let cell = cells.get(key);
      if (!cell) cells.set(key,cell = new Map());
      cell.set(id,(cell.get(id) ?? 0)+1);
    }
    for (const id of new Set(fills.map(([,id])=>id))) charts.set(id,(charts.get(id) ?? 0)+1);
  }
  return {
    charts:filled,
    preference:favoritePreference(records),
    cells:Object.fromEntries([...cells].map(([key,cell])=>[key,[...cell].sort(byCharts)])),
    top:[...charts].sort(byCharts).slice(0,9),
  };
}
export interface FavoritePreferenceEntry {
  /** Official species ID; all eligible forms share this ranking entry. */
  id: number;
  score: number | null;
  picks: number;
  charts: number;
  component: number | null;
  evidencePicks: number;
}
export interface FavoritePreference {
  entries: FavoritePreferenceEntry[];
  choices: number;
  charts: number;
  candidates: number;
  components: number;
  converged: boolean;
  gradientResidual: number;
  iterations: number;
  regularization: 1;
}
interface FavoritePreferencePool {
  ids: number[];
  wins: number[];
}
interface FavoritePreferenceFit {
  ids: number[];
  scores: number[];
  components: number[][];
  converged: boolean;
  gradientResidual: number;
  iterations: number;
  reason: string;
}
interface PreferenceState {
  value: number;
  g: Float64Array;
  diag: Float64Array;
  probs: number[][];
}
const preferenceCells = cellData as Record<string, {kind: string; ids?: number[]; sources?: string[]}>;

const preferenceSpecies = speciesData as Record<string, number>;
export function favoriteSpeciesId(id: number): number {
  const species = preferenceSpecies[id];
  if (species === undefined) throw new Error(`Missing Picker species identity: ${id}. Rebuild scripts/build-favorite-analytics-cells.ts.`);
  return species;
}

const preferenceFixedPools = new Map<string, {ids: number[]; key: string; positions: Map<number, number>}>(Object.entries(preferenceCells).flatMap(([key, cell]) => {
  if (cell.kind !== 'pick' || !cell.ids) return [];
  const ids = [...new Set(cell.ids.map(favoriteSpeciesId))].sort((a, b) => a - b);
  return [[key, {ids, key: ids.join(','), positions: new Map(ids.map((id, i) => [id, i]))}] as const];
}));
const preferenceCache = new Map<string, FavoritePreference>();

export function fitFavoritePreference(input: FavoritePreferencePool[], lambda = 1): FavoritePreferenceFit {
 const started = Date.now();
 const timeBudgetMs = 2000;
 const tolerance = 1e-7;
 const maxIterations = 20;
 if (!Number.isFinite(lambda) || lambda <= 0) throw Error("positive finite lambda required");
 const clean=input.flatMap(p=>{
  if(p.ids.length!==p.wins.length)throw Error("length mismatch");
  const c=new Map<number, number>();
  p.ids.forEach((id,j)=>{const w=p.wins[j];if(!Number.isSafeInteger(id) || id <= 0 || !(Number.isFinite(w)&&w>=0))throw Error("invalid candidate or count");
   c.set(id,(c.get(id)??0)+w);});
  const ids=[...c.keys()].sort((a,b)=>a-b),wins=ids.map(id=>c.get(id)!);
  const n=wins.reduce((a,b)=>a+b,0);if(!Number.isFinite(n))throw Error("invalid total count");return ids.length>1&&n>0?[{ids,wins,n}]:[];
 });
 const ids=[...new Set(clean.flatMap(p=>p.ids))].sort((a,b)=>a-b),N=ids.length;
 const index=new Map(ids.map((id,j)=>[id,j]));
 const pools=clean.map(p=>({...p,indices:p.ids.map(id=>index.get(id)!)}));
 const parent=Array.from({length:N},(_,i)=>i);
 const find=(i: number): number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(const p of pools)for(let j=1;j<p.indices.length;j++)parent[find(p.indices[j])]=find(p.indices[0]);
 const groups=new Map<number, number[]>();ids.forEach((id,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root)!.push(id);});
 const dot=(a: Float64Array, b: Float64Array): number=>{let z=0;for(let i=0;i<N;i++)z+=a[i]*b[i];return z;};
 const evaluate=(t: Float64Array): PreferenceState=>{
  let value=0;const g=new Float64Array(N),diag=new Float64Array(N).fill(lambda),probs: number[][]=[];
  for(let i=0;i<N;i++){value+=lambda*t[i]*t[i]/2;g[i]=lambda*t[i];}
  for(const p of pools){
   let max=-Infinity;for(const i of p.indices)max=Math.max(max,t[i]);
   const q=p.indices.map(i=>Math.exp(t[i]-max));const sum=q.reduce((a,b)=>a+b,0);
   value+=p.n*Math.log(sum);
   for(let j=0;j<q.length;j++){q[j]/=sum;const i=p.indices[j];
    value-=p.wins[j]*(t[i]-max);g[i]+=p.n*q[j]-p.wins[j];diag[i]+=p.n*q[j]*(1-q[j]);}
   probs.push(q);
  }
  return{value,g,diag,probs};
 };
 const hessianMultiply=(v: Float64Array, state: PreferenceState): Float64Array=>{
  const out=Float64Array.from(v,x=>lambda*x);
  for(let k=0;k<pools.length;k++){
   const p=pools[k],q=state.probs[k];let mean=0;
   for(let j=0;j<q.length;j++)mean+=q[j]*v[p.indices[j]];
   for(let j=0;j<q.length;j++)out[p.indices[j]]+=p.n*q[j]*(v[p.indices[j]]-mean);
  }
  return out;
 };
 let theta: Float64Array=new Float64Array(N),state=evaluate(theta),iterations=0;
 let converged=false,reason="iteration limit",residual=0;
 optimization: for(;iterations<maxIterations;iterations++){
  if (Date.now() - started >= timeBudgetMs) {reason = 'time budget'; break;}
  residual=state.g.reduce((a,b)=>Math.max(a,Math.abs(b)),0);
  if(residual<=tolerance){converged=true;reason="gradient";break;}
  const d=new Float64Array(N),r=Float64Array.from(state.g,x=>-x);
  let z=Float64Array.from(r,(x,i)=>x/state.diag[i]),rz=dot(r,z);
  const p=Float64Array.from(z);
  const initialNorm=Math.sqrt(dot(r,r));
  const relativeTolerance = Math.min(0.1, Math.sqrt(residual));
  for(let cg=0;cg<Math.min(N,50);cg++){
   if (Date.now() - started >= timeBudgetMs) {reason = 'time budget'; break optimization;}
   const hp=hessianMultiply(p,state),denom=dot(p,hp);
   if(!(denom>0))throw Error("non-positive Hessian curvature");
   const alpha=rz/denom;
   for(let i=0;i<N;i++){d[i]+=alpha*p[i];r[i]-=alpha*hp[i];}
   if(Math.sqrt(dot(r,r))<=Math.max(1e-12,initialNorm*relativeTolerance))break;
   z=Float64Array.from(r,(x,i)=>x/state.diag[i]);const nextRz=dot(r,z),beta=nextRz/rz;
   for(let i=0;i<N;i++)p[i]=z[i]+beta*p[i];rz=nextRz;
  }
  const slope=dot(state.g,d);if(!(slope<0)){reason="non-descent direction";break;}
  let step=1, next: PreferenceState | undefined, nextTheta: Float64Array | undefined, accepted=false;
  for(let backtrack=0;backtrack<40;backtrack++){
   if (Date.now() - started >= timeBudgetMs) {reason = 'time budget'; break optimization;}
   nextTheta=Float64Array.from(theta,(x,i)=>x+step*d[i]);next=evaluate(nextTheta);
   if(Number.isFinite(next.value)&&next.value<=state.value+1e-4*step*slope){accepted=true;break;}
   step*=0.5;
  }
  if(!accepted || !next || !nextTheta){reason="line search failed";break;}
  if(nextTheta.every((x,i)=>x===theta[i])){reason="floating point stall";break;}
  theta=nextTheta;state=next;
 }
 residual=state.g.reduce((a,b)=>Math.max(a,Math.abs(b)),0);
 if(residual<=tolerance){converged=true;reason="gradient";}
 let max=-Infinity;for(const t of theta)max=Math.max(max,t);
 const weights=Array.from(theta,t=>Math.exp(t-max)),sum=weights.reduce((a,b)=>a+b,0);
 return {ids, scores:weights.map(w=>N*w/sum), components:[...groups.values()],
  iterations, converged, reason, gradientResidual:residual};
}
export function favoritePreference(records: FavoriteRecord[]): FavoritePreference {
  const regularization = 1 as const;
  const current = records.flatMap(record => {
    const snapshot = parseFavoriteSnapshot(record.latest);
    return snapshot ? [{cid: record.cid ?? null, fills: snapshot.fills}] : [];
  });
  const chartKeys = [];
  let keyCharacters = 0;
  for (const chart of current) {
    const encoded = JSON.stringify([chart.cid, chart.fills]);
    keyCharacters += encoded.length;
    if (keyCharacters > 2_000_000) break;
    chartKeys.push(encoded);
  }
  const cacheKey = keyCharacters <= 2_000_000 ? JSON.stringify(chartKeys.sort()) : null;
  if (cacheKey !== null) {
    const cached = preferenceCache.get(cacheKey);
    if (cached) return cached;
  }
  const counts = new Map<number, {picks: number; charts: number; evidencePicks: number}>();
  const pools = new Map<string, FavoritePreferencePool>();
  let choices = 0;
  let charts = 0;
  for (const {fills} of current) {
    const chartIds = new Set(Object.values(fills).map(favoriteSpeciesId));
    for (const id of chartIds) {
      let entry = counts.get(id);
      if (!entry) {
        entry = {picks: 0, charts: 0, evidencePicks: 0};
        counts.set(id, entry);
      }
      entry.charts++;
    }
    let contributed = false;
    for (const [key, formId] of Object.entries(fills)) {
      const id = favoriteSpeciesId(formId);
      const entry = counts.get(id)!;
      entry.picks++;
      const cell = preferenceCells[key];
      const fixed = preferenceFixedPools.get(key);
      const ids = fixed?.ids ?? [...new Set((cell.sources ?? [])
        .map(source => fills[source]).filter((id): id is number => id !== undefined).map(favoriteSpeciesId))].sort((a, b) => a - b);
      if (ids.length < 2) continue;
      const winner = fixed?.positions.get(id) ?? ids.indexOf(id);
      if (winner < 0) continue;
      const poolKey = fixed?.key ?? ids.join(',');
      let pool = pools.get(poolKey);
      if (!pool) {
        pool = {ids, wins: ids.map(() => 0)};
        pools.set(poolKey, pool);
      }
      pool.wins[winner]++;
      entry.evidencePicks++;
      choices++;
      contributed = true;
    }
    if (contributed) charts++;
  }
  const fitted = fitFavoritePreference([...pools.values()], regularization);
  const scoreById = new Map(fitted.ids.map((id, i) => [id, fitted.scores[i]]));
  const componentById = new Map<number, number>();
  fitted.components.forEach((component, i) => component.forEach(id => componentById.set(id, i)));
  const entries = [...counts].map(([id, count]) => ({
    id,
    score: fitted.converged && count.evidencePicks > 0 ? scoreById.get(id) ?? null : null,
    ...count,
    component: componentById.get(id) ?? null,
  })).sort((a, b) => {
    if (a.score !== null && b.score !== null) return b.score - a.score || b.picks - a.picks || a.id - b.id;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    return b.picks - a.picks || a.id - b.id;
  });
  const result = {
    entries, choices, charts, candidates: fitted.ids.length, components: fitted.components.length,
    converged: fitted.converged, gradientResidual: fitted.gradientResidual,
    iterations: fitted.iterations, regularization,
  };
  if (cacheKey !== null && fitted.converged) {
    preferenceCache.set(cacheKey, result);
    if (preferenceCache.size > 4) preferenceCache.delete(preferenceCache.keys().next().value!);
  }
  return result;
}

export type FavoriteUser = Omit<FavoriteRecord,'seenIds'> & {archived?:boolean};
export function favoriteUser(r:FavoriteRecord, archived:boolean):FavoriteUser {
  const {seenIds: _seenIds,...user} = r;
  void _seenIds;
  return {...user,archived};
}
