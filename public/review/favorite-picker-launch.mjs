const KEY = 'my151.favorite-picker-launch-review.v1';
const choiceGroups = {
  stats_population: {title:'Pick population', target:'stats-options', options:[['unique_forms','Unique selected forms — recommended','Each form counts once. Repeated picks add no weight.'],['unique_species','Unique species','Regional, Mega, and other forms count as one species.'],['filled_pick_cells','Filled pick cells','Repeated selections count again; pointers are excluded. This measures the filled chart.'],['summary_favorites','Summary only','Count distinct forms referenced by type, generation, special, and ultimate favorites. Repeated pointers count once. A fair comparison baseline needs further modeling.']]},
  stats_baseline: {title:'Comparison baseline',target:'stats-options',options:[['eligible_choices','Eligible choices — recommended','Compare each occupied pick cell with the choices it allows. Disclose weighting and partial coverage.'],['national_dex','Whole National Dex','Show an unadjusted reference. Required type/generation slots can create apparent preference. Label it descriptive.']]},
  stats_layout: {title:'Layout',target:'layout-options',options:[['side_rail','A · Side rail','Dex-style butterfly charts in one vertical column.'],['side_matrix','B · Side matrix','Dex-style butterfly charts in a two-column panel.'],['focused_two_charts','C · Two focused charts','Full type and evolution butterfly charts; defer shape and color.']]},
  stats_launch: {title:'Detailed stats at launch',target:'launch-options',options:[['include','Include before launch','Adds design and data work before release. Recommended if detailed stats are essential to your launch.'],['defer','Release core Picker first — recommended','Launch Full grid and Simplified; add detailed stats after analytics and release checks.']]},
};
const dimensions = [['type','Type'],['evolution','Evolution stage'],['shape','Shape'],['color','Color'],['base_stats','Base stats']];
const model = await fetch('./favorite-picker-launch-model.json').then(r => {if(!r.ok) throw Error('Copy model could not load.');return r.json();}).catch(e => {document.querySelector('#boot-error').textContent=e.message;return null;});
if (model) init(model);
function init(model) {
  const copyFields = model.groups.flatMap(g=>g.fields);
  const defaults = () => ({schemaVersion:1,sourceRevision:model.sourceRevision,copy:Object.fromEntries(copyFields.map(f=>[f.id,{value:f.proposed,approved:false}])),choices:Object.fromEntries(Object.keys(choiceGroups).map(id=>[id,{value:null,answered:false}])),charts:{values:['type','evolution','shape','color'],answered:false},notes:''});
  let state=defaults();
  function validate(raw) {
    if(!raw || raw.schemaVersion!==1 || typeof raw!=='object' || typeof raw.sourceRevision!=='string') throw Error('Unsupported decision file version.');
    if(!raw.copy || !raw.choices || !raw.charts) throw Error('Decision file is incomplete.');
    const result=defaults();
    for(const f of copyFields) {
      const v=raw.copy[f.id];
      if(!v || typeof v.value!=='string' || v.value.length>16000 || typeof v.approved!=='boolean') throw Error('Invalid copy field: '+f.id);
      if(v.approved && !v.value.trim()) throw Error('Approved copy cannot be blank: '+f.id);
      result.copy[f.id]={value:v.value,approved:v.approved};
    }
    for(const [id,g] of Object.entries(choiceGroups)) {
      const v=raw.choices[id];
      if(!v || typeof v.answered!=='boolean' || (v.value!==null && !g.options.some(o=>o[0]===v.value)) || (v.answered && v.value===null)) throw Error('Invalid choice: '+id);
      result.choices[id]={value:v.value,answered:v.answered};
    }
    if(!Array.isArray(raw.charts.values) || raw.charts.values.length>dimensions.length || new Set(raw.charts.values).size!==raw.charts.values.length || raw.charts.values.some(v=>!dimensions.some(d=>d[0]===v)) || typeof raw.charts.answered!=='boolean' || (raw.charts.answered&&!raw.charts.values.length)) throw Error('Invalid chart selection.');
    if(typeof raw.notes!=='string' || raw.notes.length>16000) throw Error('Invalid notes.');
    result.charts={values:[...raw.charts.values],answered:raw.charts.answered};result.notes=raw.notes;
    return result;
  }
  try{const saved=localStorage.getItem(KEY);if(saved) state=validate(JSON.parse(saved));}catch{message('Saved answers could not load. Defaults are shown; no approval is inferred.');}
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function message(s){document.querySelector('#status').textContent=s;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{message('Browser storage is unavailable. Export your answers before closing this page.');}summary();}
  function summary(){const done=Object.values(state.copy).filter(v=>v.approved).length+Object.values(state.choices).filter(v=>v.answered).length+Number(state.charts.answered);const total=copyFields.length+Object.keys(choiceGroups).length+1;document.querySelector('#progress').textContent=`${done} of ${total} decisions answered · ${total-done} pending`;for(const f of copyFields){const s=document.querySelector('#status-'+f.id);s.textContent=state.copy[f.id].approved?'Approved':'Proposal · pending';s.className='status'+(state.copy[f.id].approved?' done':'');}}
  function render(){
    const host=document.querySelector('#copy-groups');host.replaceChildren();
    for(const g of model.groups){const section=el('section',undefined,'section');section.id=g.id;section.append(el('h2',g.title),el('p',g.note,'muted'));
      const approveSection=el('button','Approve all text in this section');approveSection.type='button';approveSection.onclick=()=>{if(g.fields.some(f=>!state.copy[f.id].value.trim())){message('Fill each text field before approving this section.');return;}for(const f of g.fields){state.copy[f.id].approved=true;document.querySelector('#approve-'+f.id).checked=true;}save();message(g.title.replace(/^\d+\. /,'')+' text approved.');};section.append(approveSection);
      for(const f of g.fields){const box=el('div',undefined,'field');const row=el('div',undefined,'row');const label=el('label',f.label);label.htmlFor=f.id;const status=el('span');status.id='status-'+f.id;row.append(label,status);const details=el('details');details.append(el('summary','Existing copy'),el('pre',f.current));const input=el('textarea');input.id=f.id;input.value=state.copy[f.id].value;if(f.id.includes('faq'))input.className='faq';const buttons=el('div',undefined,'buttons');for(const [name,value] of [['Use existing',f.current],['Use proposal',f.proposed]]){const b=el('button',name);b.type='button';b.onclick=()=>{state.copy[f.id]={value,approved:false};input.value=value;approve.checked=false;save();};buttons.append(b);}const check=el('label',undefined,'check');const approve=el('input');approve.type='checkbox';approve.id='approve-'+f.id;approve.checked=state.copy[f.id].approved;check.append(approve,el('span','Approve this text'));approve.onchange=()=>{if(approve.checked&&!input.value.trim()){approve.checked=false;message('Enter text before approving.');input.focus();return;}state.copy[f.id].approved=approve.checked;save();};input.oninput=()=>{state.copy[f.id]={value:input.value,approved:false};approve.checked=false;save();};box.append(row,details,input,buttons,check);section.append(box);}host.append(section);}
    document.querySelector('#stats-options').replaceChildren();document.querySelector('#layout-options').replaceChildren();document.querySelector('#launch-options').replaceChildren();
    for(const [id,g] of Object.entries(choiceGroups)){const target=document.querySelector('#'+g.target);if(id!=='stats_layout')target.append(el('h3',g.title));const group=el('fieldset',undefined,'choices');group.style.border='0';group.style.padding='0';group.style.minWidth='0';const legend=el('legend',g.title);legend.style.position='absolute';legend.style.width='1px';legend.style.height='1px';legend.style.overflow='hidden';group.append(legend);for(const [value,title,desc] of g.options){const card=el('label',undefined,'choice');const radio=el('input');radio.type='radio';radio.name=id;radio.value=value;radio.checked=state.choices[id].answered&&state.choices[id].value===value;const row=el('div',undefined,'row');row.append(radio,el('strong',title));card.append(row,el('p',desc,'muted'));if(id==='stats_layout'){
          card.append(el('small',value==='side_rail'?'Displays the ten types and seven shapes with the highest reference ratios; all evolution roles and colors.':value==='side_matrix'?'Recommended: all four dimensions, with every category shown.':'Least dense; all type and evolution rows, without shape/color charts.'));
          for(const mode of ['simplified','full']){
            const frame=el('iframe');frame.src='./stats/'+value+'-'+mode+'.html';frame.title=title+' · '+mode+' mockup';frame.className='preview';frame.loading='lazy';frame.setAttribute('data-audit-scale','intended');frame.style.aspectRatio=value==='side_matrix'?(mode==='full'?'4369/1749':'2302/1064'):value==='side_rail'?(mode==='full'?'3403/1748':'1804/1344'):(mode==='full'?'3716/1748':'1909/1064');
            const link=el('a','View '+(mode==='full'?'Full grid':'Simplified')+' at full size');link.href=frame.src;link.target='_blank';link.rel='noopener';card.append(frame,link);
          }
        }radio.onchange=()=>{state.choices[id]={value,answered:true};save();};group.append(card);}target.append(group);}
    document.querySelector('#layout-note').textContent='All designs use the same saved chart: 226 filled pick cells and 208 distinct forms. Chart references are proposals, not a final preference score. Type follows Picker eligibility. Shape, color, and evolution can use species metadata for forms; this needs an explicit disclosure. Open full-size designs to inspect their labels.';
    const charts=document.querySelector('#chart-options');charts.replaceChildren();for(const [id,name] of dimensions){const label=el('label',undefined,'check');const input=el('input');input.type='checkbox';input.value=id;input.checked=state.charts.values.includes(id);label.append(input,el('span',name));input.onchange=()=>{state.charts.values=input.checked?[...state.charts.values,id]:state.charts.values.filter(v=>v!==id);state.charts.answered=false;document.querySelector('#charts-confirm').checked=false;save();};charts.append(label);}document.querySelector('#charts-confirm').checked=state.charts.answered;document.querySelector('#notes').value=state.notes;summary();
  }
  function payload(){return {...state,exportedAt:new Date().toISOString(),pending:[...copyFields.filter(f=>!state.copy[f.id].approved).map(f=>f.id),...Object.keys(choiceGroups).filter(id=>!state.choices[id].answered),...(!state.charts.answered?['stats_dimensions']:[])]};}
  function markdown(){return ['# Favorite Pokémon launch decisions','Schema: 1 · Source: '+model.sourceRevision,'',...copyFields.flatMap(f=>['## '+f.label,state.copy[f.id].approved?'APPROVED':'PENDING — proposal only',state.copy[f.id].value,'']),...Object.entries(choiceGroups).flatMap(([id,g])=>['## '+g.title,state.choices[id].answered?g.options.find(o=>o[0]===state.choices[id].value)[1]:'PENDING','']),'## Charts',state.charts.answered?'APPROVED: '+state.charts.values.join(', '):'PENDING — proposed: '+state.charts.values.join(', '),'','## Notes',state.notes||'None','', 'Production launch is not authorized by this document.'].join('\n');}
  document.querySelector('#charts-confirm').onchange=e=>{if(e.target.checked&&!state.charts.values.length){e.target.checked=false;message('Choose at least one chart.');return;}state.charts.answered=e.target.checked;save();};
  document.querySelector('#notes').oninput=e=>{state.notes=e.target.value;save();};
  const output=document.querySelector('#output');
  document.querySelector('#copy-md').onclick=async()=>{output.value=markdown();try{await navigator.clipboard.writeText(output.value);message('Answers copied. Paste them into chat.');}catch{output.focus();output.select();message('Copy is unavailable. Select the output and copy it manually.');}};
  document.querySelector('#show-json').onclick=()=>{output.value=JSON.stringify(payload(),null,2);output.focus();message('JSON is ready to select or download.');};
  document.querySelector('#download').onclick=()=>{const text=JSON.stringify(payload(),null,2);output.value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=el('a');a.href=url;a.download='my151-favorite-picker-decisions.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Decision JSON downloaded. Attach it in chat.');};
  document.querySelector('#clear').onclick=()=>{if(!confirm('Clear your saved decisions and edits?'))return;state=defaults();output.value='';save();render();message('Answers cleared. All decisions are pending.');};
  document.querySelector('#import-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>150000)throw Error('Decision file is too large.');const imported=validate(JSON.parse(await file.text()));state=imported;save();render();output.value='';message('Answers imported. Pending decisions remain pending.');}catch(err){message('Import rejected: '+err.message+' Your answers are unchanged.');}finally{e.target.value='';}};
  render();
}
