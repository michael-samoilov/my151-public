const KEY = 'my151.favorite-picker-launch-review.v1';
const choiceGroups = {
  stats_population: {title:'Pick population', target:'stats-options', options:[['unique_forms','Unique selected forms — recommended','Each form counts once. Repeated picks add no weight.'],['unique_species','Unique species','Regional, Mega, and other forms count as one species.'],['filled_pick_cells','Filled pick cells','Repeated selections count again; pointers are excluded. This measures the filled chart.'],['summary_favorites','Summary only','Count distinct forms referenced by type, generation, special, and ultimate favorites. Repeated pointers count once. A fair comparison baseline needs further modeling.']]},
  stats_baseline: {title:'Comparison baseline',target:'stats-options',options:[['eligible_choices','Eligible choices — recommended','Compare each occupied pick cell with the choices it allows. Disclose weighting and partial coverage.'],['national_dex','Whole National Dex','Show an unadjusted reference. Required type/generation slots can create apparent preference. Label it descriptive.']]},
  stats_layout: {title:'Layout',target:'layout-options',options:[['side_rail','A · Side rail','Dex-style butterfly charts in one vertical column.'],['side_matrix','B · Side matrix','Dex-style butterfly charts in a two-column panel.'],['focused_two_charts','C · Two focused charts','Full type and evolution butterfly charts; defer shape and color.']]},
  stats_launch: {title:'Detailed stats at launch',target:'launch-options',options:[['include','Include before launch','Adds design and data work before release. Recommended if detailed stats are essential to your launch.'],['defer','Release core Picker first — recommended','Launch Full grid and Simplified; add detailed stats after analytics and release checks.']]},
};
const resolvedStats = {stats_population:'filled_pick_cells',stats_baseline:'eligible_choices',stats_layout:'side_matrix',stats_launch:'include'};
const dimensions = [['type','Type'],['evolution','Evolution stage'],['shape','Shape'],['color','Color'],['base_stats','Base stats']];
const model = await fetch('./favorite-picker-launch-model.json').then(r => {if(!r.ok) throw Error('Copy model could not load.');return r.json();}).catch(e => {document.querySelector('#boot-error').textContent=e.message;return null;});
if (model) init(model);
function init(model) {
  const copyFields = model.groups.flatMap(g=>g.fields);
  const pendingFields = copyFields.filter(f=>!f.resolved);
  const defaults = () => ({schemaVersion:1,sourceRevision:model.sourceRevision,copy:Object.fromEntries(copyFields.map(f=>[f.id,{value:f.proposed,approved:!!f.resolved}])),choices:Object.fromEntries(Object.keys(choiceGroups).map(id=>[id,{value:null,answered:false}])),charts:{values:['type','evolution','shape','color','base_stats'],answered:true},notes:'',previousCopy:{}});
  let state=defaults();
  function validate(raw) {
    if(!raw || raw.schemaVersion!==1 || typeof raw!=='object' || typeof raw.sourceRevision!=='string') throw Error('Unsupported decision file version.');
    if(!raw.copy || !raw.choices || !raw.charts) throw Error('Decision file is incomplete.');
    const result=defaults();
    for(const f of copyFields) {
      const v=raw.copy[f.id];
      if(!v && f.resolved) continue;
      if(!v || typeof v.value!=='string' || v.value.length>16000 || typeof v.approved!=='boolean') throw Error('Invalid copy field: '+f.id);
      if(v.approved && !v.value.trim()) throw Error('Approved copy cannot be blank: '+f.id);
      result.copy[f.id]={value:!v.approved && f.previousProposals?.includes(v.value)?f.proposed:v.value,approved:v.approved};
    }
    for(const [id,g] of Object.entries(choiceGroups)) {
      const v=raw.choices[id];
      if(!v || typeof v.answered!=='boolean' || (v.value!==null && !g.options.some(o=>o[0]===v.value)) || (v.answered && v.value===null)) throw Error('Invalid choice: '+id);
      result.choices[id]={value:v.value,answered:v.answered};
    }
    if(!Array.isArray(raw.charts.values) || raw.charts.values.length>dimensions.length || new Set(raw.charts.values).size!==raw.charts.values.length || raw.charts.values.some(v=>!dimensions.some(d=>d[0]===v)) || typeof raw.charts.answered!=='boolean' || (raw.charts.answered&&!raw.charts.values.length)) throw Error('Invalid chart selection.');
    if(typeof raw.notes!=='string' || raw.notes.length>16000) throw Error('Invalid notes.');
    result.charts={values:[...raw.charts.values],answered:raw.charts.answered};result.notes=raw.notes;
    if(raw.previousCopy!==undefined){
      if(!raw.previousCopy || typeof raw.previousCopy!=='object' || Array.isArray(raw.previousCopy))throw Error('Invalid previous copy record.');
      for(const f of copyFields){const v=raw.previousCopy[f.id];if(v===undefined)continue;if(!v || typeof v.value!=='string' || v.value.length>16000 || typeof v.approved!=='boolean')throw Error('Invalid previous copy: '+f.id);result.previousCopy[f.id]={value:v.value,approved:v.approved};}
    }
    return result;
  }
  try{const saved=localStorage.getItem(KEY);if(saved) state=validate(JSON.parse(saved));}catch{message('Saved answers could not load. Defaults are shown; no approval is inferred.');}
  function applyResolvedStats(){for(const f of copyFields.filter(f=>f.resolved)){const v=state.copy[f.id];if(v.value!==f.current)state.previousCopy[f.id]={...v};state.copy[f.id]={value:f.current,approved:true};}for(const [id,value] of Object.entries(resolvedStats))state.choices[id]={value,answered:true};state.charts={values:dimensions.map(d=>d[0]),answered:true};}
  applyResolvedStats();
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function message(s){document.querySelector('#status').textContent=s;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{message('Browser storage is unavailable. Export your answers before closing this page.');}summary();}
  function summary(){const done=pendingFields.filter(f=>state.copy[f.id].approved).length;const total=pendingFields.length;document.querySelector('#progress').textContent=total?`${done} of ${total} copy decisions answered · ${total-done} pending`:'All copy approved in chat · 0 pending';for(const f of copyFields){const s=document.querySelector('#status-'+f.id);s.textContent=f.resolved?'Approved in chat':state.copy[f.id].approved?'Approved':'Draft · pending';s.className='status'+(state.copy[f.id].approved?' done':'');}}
  function render(){
    const host=document.querySelector('#copy-groups');host.replaceChildren();
    for(const g of model.groups){const section=el('section',undefined,'section');section.id=g.id;section.append(el('h2',g.title),el('p',g.note,'muted'));
      const approveSection=el('button','Approve all text in this section');approveSection.type='button';approveSection.onclick=()=>{if(g.fields.some(f=>!state.copy[f.id].value.trim())){message('Fill each text field before approving this section.');return;}for(const f of g.fields){state.copy[f.id].approved=true;document.querySelector('#approve-'+f.id).checked=true;}save();message(g.title.replace(/^\d+\. /,'')+' text approved.');};if(g.fields.some(f=>!f.resolved))section.append(approveSection);
      for(const f of g.fields){const box=el('div',undefined,'field');const row=el('div',undefined,'row');const label=el('label',f.label);label.htmlFor=f.id;const status=el('span');status.id='status-'+f.id;row.append(label,status);if(f.resolved){box.append(row,el('pre',f.current));section.append(box);continue;}const details=el('details');details.append(el('summary','Existing copy'),el('pre',f.current));const input=el('textarea');input.id=f.id;input.value=state.copy[f.id].value;if(f.id.includes('faq'))input.className='faq';const buttons=el('div',undefined,'buttons');for(const [name,value] of [['Use existing',f.current],['Use proposal',f.proposed]]){const b=el('button',name);b.type='button';b.onclick=()=>{state.copy[f.id]={value,approved:false};input.value=value;approve.checked=false;save();};buttons.append(b);}const check=el('label',undefined,'check');const approve=el('input');approve.type='checkbox';approve.id='approve-'+f.id;approve.checked=state.copy[f.id].approved;check.append(approve,el('span','Approve this text'));approve.onchange=()=>{if(approve.checked&&!input.value.trim()){approve.checked=false;message('Enter text before approving.');input.focus();return;}state.copy[f.id].approved=approve.checked;save();};input.oninput=()=>{state.copy[f.id]={value:input.value,approved:false};approve.checked=false;save();};box.append(row,details);if(f.recommendation)box.append(el('p',f.recommendation,'muted'));box.append(input,buttons,check);section.append(box);}host.append(section);}
    document.querySelector('#stats-options').replaceChildren();document.querySelector('#layout-options').replaceChildren();document.querySelector('#launch-options').replaceChildren();
    document.querySelector('#stats-options').append(el('p','Resolved: each occupied valid selector with multiple distinct options counts once. Repeats count separately; favorite pointers and singleton selectors are excluded. The comparison averages the actual options available in those same selectors. Guaranteed attributes contribute neutral counts. Missing metadata excludes the entire selector for that chart only.'));
    const frame=el('iframe');frame.src='./stats/conditional-full.html';frame.title='Full-grid conditional statistics export';frame.className='preview';frame.style.aspectRatio='4064/1724';frame.loading='lazy';frame.setAttribute('data-audit-scale','intended');document.querySelector('#layout-options').append(frame);
    const link=el('a','View Full-grid statistics at full size');link.href=frame.src;link.target='_blank';link.rel='noopener';document.querySelector('#layout-options').append(link);
    document.querySelector('#layout-note').textContent='Current requested layout: Type then Color on the left; Shape then Evolution then Base Stat Total on the right. Detailed stats are Full-grid only. Summary remains an ordinary export.';
    const charts=document.querySelector('#chart-options');charts.replaceChildren();for(const [id,name] of dimensions){const label=el('label',undefined,'check');const input=el('input');input.type='checkbox';input.disabled=true;input.value=id;input.checked=state.charts.values.includes(id);label.append(input,el('span',name));input.onchange=()=>{state.charts.values=input.checked?[...state.charts.values,id]:state.charts.values.filter(v=>v!==id);state.charts.answered=false;document.querySelector('#charts-confirm').checked=false;save();};charts.append(label);}document.querySelector('#charts-confirm').checked=state.charts.answered;document.querySelector('#charts-confirm').disabled=true;document.querySelector('#notes').value=state.notes;
    for(const [target,items] of [['launch-options',model.launchReview],['optional-options',model.optionalReview]]){const host=document.querySelector('#'+target);host.replaceChildren();for(const item of items){const box=el('div',undefined,'field');box.append(el('h3',item.title),el('p',item.status,'status'),el('p',item.text));host.append(box);}}
    summary();
  }
  function payload(){return {...state,exportedAt:new Date().toISOString(),pending:[...pendingFields.filter(f=>!state.copy[f.id].approved).map(f=>f.id),...Object.keys(choiceGroups).filter(id=>!state.choices[id].answered),...(!state.charts.answered?['stats_dimensions']:[])]};}
  function markdown(){return ['# Favorite Pokémon launch feedback','Schema: 1 · Source: '+model.sourceRevision,'',...model.groups.flatMap(g=>['# '+g.title,...g.fields.flatMap(f=>['## '+f.label,f.resolved?'RESOLVED IN CHAT':state.copy[f.id].approved?'APPROVED':'PENDING — draft only',state.copy[f.id].value,''])]),'## Resolved statistics','Full-grid only; one vote per valid occupied independent selector with alternatives. Favorite pointers and singleton pools excluded. Expected counts use those exact selector pools.','Charts: '+state.charts.values.join(', '),'','## Remaining launch work',...model.launchReview.flatMap(item=>[item.title+' — '+item.status,item.text,'']),'## Optional later work',...model.optionalReview.flatMap(item=>[item.title+' — '+item.status,item.text,'']),'## Earlier edits to now-approved copy',...Object.entries(state.previousCopy).flatMap(([id,v])=>[id+' — retained for reference only',v.value,'']),'## Notes',state.notes||'None','', 'Production launch is not authorized by this document.'].join('\n');}
  document.querySelector('#charts-confirm').onchange=e=>{if(e.target.checked&&!state.charts.values.length){e.target.checked=false;message('Choose at least one chart.');return;}state.charts.answered=e.target.checked;save();};
  document.querySelector('#notes').oninput=e=>{state.notes=e.target.value;save();};
  const output=document.querySelector('#output');
  document.querySelector('#copy-md').onclick=async()=>{output.value=markdown();try{await navigator.clipboard.writeText(output.value);message('Answers copied. Paste them into chat.');}catch{output.focus();output.select();message('Copy is unavailable. Select the output and copy it manually.');}};
  document.querySelector('#show-json').onclick=()=>{output.value=JSON.stringify(payload(),null,2);output.focus();message('JSON is ready to select or download.');};
  document.querySelector('#download').onclick=()=>{const text=JSON.stringify(payload(),null,2);output.value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=el('a');a.href=url;a.download='my151-favorite-picker-decisions.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Decision JSON downloaded. Attach it in chat.');};
  document.querySelector('#clear').onclick=()=>{if(!confirm('Clear your saved decisions and edits?'))return;state=defaults();applyResolvedStats();output.value='';save();render();message('Saved notes and earlier edits cleared. Approved copy and statistics remain resolved.');};
  document.querySelector('#import-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>150000)throw Error('Decision file is too large.');const imported=validate(JSON.parse(await file.text()));state=imported;applyResolvedStats();save();render();output.value='';message('Answers imported. Approved copy remains fixed; Notes and earlier edits are retained.');}catch(err){message('Import rejected: '+err.message+' Your answers are unchanged.');}finally{e.target.value='';}};
  render();
}
