import csv,json,struct,collections,pathlib,hashlib,sys,argparse
parser=argparse.ArgumentParser(description="Audit identity-checked Pokémon/form data against pinned offline sources.")
parser.add_argument("sources",type=pathlib.Path)
parser.add_argument("--write",action="store_true")
args=parser.parse_args()
D=pathlib.Path('docs/favorite-picker-work/form-metadata-audit');S=args.sources
shapePath=pathlib.Path('src/data/form-shapes.json')
formShapes={int(k):v for k,v in json.loads(shapePath.read_text()).items()}
shapeReviewPath=pathlib.Path('docs/favorite-picker-work/form-shape-review/review.json')
shapeIdentities={r['pickerId']:r for r in json.loads(shapeReviewPath.read_text())['documentedFormDifferences']['mismatches']}
assert formShapes=={pid:r['listedShapeKey'] for pid,r in shapeIdentities.items()}, 'Form-shape overrides differ from the reviewed identities and classifications'
seenFormShapes=set()
for entry in json.loads((D/'sources.json').read_text()):
 raw=(S/entry['file']).read_bytes()
 if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise ValueError('Pinned source changed: '+entry['file'])
def table(n):return list(csv.DictReader((S/(n+'.csv')).open()))
pkm={int(x['id']):x for x in table('pokemon')};species={int(x['id']):x for x in table('pokemon_species')};forms=table('pokemon_forms');formNames={x['identifier']:x for x in forms}; formsByMon=collections.defaultdict(list)
for f in forms:formsByMon[int(f['pokemon_id'])].append(f)
types=collections.defaultdict(list); typeNames=['','normal','fighting','flying','poison','ground','rock','bug','ghost','steel','fire','water','grass','electric','psychic','ice','dragon','dark','fairy']
for r in table('pokemon_types'):types[int(r['pokemon_id'])].append((int(r['slot']),typeNames[int(r['type_id'])]))
types={k:[v for i,v in sorted(r)] for k,r in types.items()};stats=collections.defaultdict(dict);statNames=['','hp','atk','def','spa','spd','spe']
for r in table('pokemon_stats'):stats[int(r['pokemon_id'])][statNames[int(r['stat_id'])]]=int(r['base_stat'])
colors={int(x['id']):x['identifier'] for x in table('pokemon_colors')};shapes={int(x['id']):x['identifier'] for x in table('pokemon_shapes')};eggs={int(x['id']):x['identifier'] for x in table('egg_groups')};speciesEggs=collections.defaultdict(list)
for r in table('pokemon_egg_groups'):speciesEggs[int(r['species_id'])].append(eggs[int(r['egg_group_id'])])
cat=json.load(sys.stdin);shared=json.load(open('src/data/pokemon.json'));byApp={p['id']:p for p in shared}; bstPro=json.load(open('docs/favorite-picker-work/conditional-stats/bst-provenance.json'));identity={p['id']:p for p in bstPro['inventory']}
games={g:(S/('personal_'+g)).read_bytes() for g in ['sv','swsh','la','uu','ao','za']};sizes={'sv':80,'swsh':176,'la':176,'uu':84,'ao':80,'za':80};gameTypeNames=['normal','fighting','flying','poison','ground','rock','bug','ghost','steel','fire','water','grass','electric','psychic','ice','dragon','dark','fairy'];gameColors=['red','blue','yellow','green','black','brown','purple','gray','white','pink'];growths=['medium','erratic','fluctuating','medium-slow','fast','slow']
def formIndex(sid,name,form,g):
 if '-gmax' in name:
  if sid==892:return 1 if 'rapid-strike' in name else 0
  if sid==849:return 1 if 'low-key' in name else 0
  return 0
 if sid==25:
  if name=='pikachu':return 0
  cosplay=['rock-star','belle','pop-star','phd','libre','cosplay']
  if name.removeprefix('pikachu-') in cosplay:return cosplay.index(name.removeprefix('pikachu-'))+1 if g=='ao' else None
  caps=['original-cap','hoenn-cap','sinnoh-cap','unova-cap','kalos-cap','alola-cap','partner-cap','starter','world-cap']
  return caps.index(name.removeprefix('pikachu-'))+1 if name.removeprefix('pikachu-') in caps and g!='ao' else None
 if sid==80 and name=='slowbro-galar':return 2
 if sid==668 and name=='pyroar-mega':return 1
 if sid in [592,593,668] and name.endswith('-female'):return 0
 if sid==172 and name=='pichu-spiky-eared':return 0
 if sid==646:return {'kyurem':0,'kyurem-white':1,'kyurem-black':2}.get(name)
 if sid==718:return {'zygarde-50':0,'zygarde-10':1,'zygarde-10-power-construct':2,'zygarde-50-power-construct':3,'zygarde-complete':4}.get(name)
 if sid==869 and form:return (int(form['form_order'])-1)%9
 return int(form['form_order'])-1 if form else 0

def gameRow(sid,form,name,pid):
 fi=formIndex(sid,name,form,'sv');rejected=[]
 for g in ['sv','swsh','la','uu','ao','za']:
  idx=formIndex(sid,name,form,g)
  if idx is None:continue
  if sid>{'sv':1025,'swsh':898,'la':905,'uu':807,'ao':721,'za':1025}[g]:continue
  size=sizes[g];b=games[g];base=b[sid*size:(sid+1)*size]
  if len(base)!=size or sum(base[:6])==0:continue
  at=24 if g in ['sv','za'] else 30 if g in ['swsh','la'] else 28;countAt=26 if g in ['sv','za'] else 32
  ptr=struct.unpack_from('<H',base,at)[0];count=base[countAt]
  if idx>=max(1,count):continue
  rowIndex=ptr+idx-1 if idx and ptr else sid
  row=b[rowIndex*size:(rowIndex+1)*size]
  if len(row)!=size or sum(row[:6])==0:continue
  present=row[28]!=0 if g in ['sv','za'] else bool(row[33]&64) if g in ['swsh','la'] else True
  if not present:continue
  typ=list(dict.fromkeys(gameTypeNames[x] for x in row[6:8]));st=dict(zip(['hp','atk','def','spe','spa','spd'],row[:6]));col=row[27] if g in ['sv','za'] else row[33]&63
  if typ!=types[pid]:rejected.append({'game':g,'index':idx,'reason':'types differ','types':typ});continue
  if st!=stats[pid] and not (pid==10280 and g=='za' and idx==1):rejected.append({'game':g,'index':idx,'reason':'stats differ','stats':st});continue
  if col>=len(gameColors):continue
  heightAt=32 if g in ['sv','za'] else 36;weightAt=34 if g in ['sv','za'] else 38
  return {'game':g,'form':idx,'record':rowIndex,'stats':st,'color':gameColors[col],'heightDm':struct.unpack_from('<H',row,heightAt)[0]/10,'weightHg':struct.unpack_from('<H',row,weightAt)[0],'captureRate':row[8],'evoStage':row[9],'growthRate':growths[row[15 if g in ['sv','za'] else 21]],'eggGroups':list(dict.fromkeys(eggs[x] for x in row[16:18] if x)) if g in ['sv','za'] else list(dict.fromkeys(eggs[x] for x in row[22:24] if x)),'rejected':rejected}
 return {'unknown':'No version/form record matches identity, types, six stats and presence','rejected':rejected}

inventory=[];changes=[];runtime={}; unknown=[]
for m in cat:
 ident=identity.get(m['id'])
 if not ident:
  owner=identity[m['ownerId']];ident={**owner,'id':m['id'],'name':m['name'],'mapping':'cosmetic female sprite uses species personal record'}
 pid=ident['sourceId'];sid=ident['speciesId'];p=pkm[pid];sp=species[sid]
 slug=m['name'].lower().replace(' ','-');slug='vivillon-poke-ball' if slug=='vivillon-pokeball' else slug
 if slug.startswith('alcremie-') and slug[9:] in ['berry','love','star','clover','flower','ribbon']:slug='alcremie-vanilla-cream-'+slug[9:]+'-sweet'
 form=formNames.get(slug)
 if not form:form=next((f for f in formsByMon[pid] if f['is_default']=='1'),formsByMon[pid][0])
 name=form['identifier'];game=gameRow(sid,form,name,pid)
 source={'types':types[pid],'stats':game.get('stats',stats[pid]),'bst':sum(game.get('stats',stats[pid]).values()),'heightDm':int(p['height']),'weightHg':int(p['weight']),'shape':shapes[int(sp['shape_id'])],'speciesColor':colors[int(sp['color_id'])],'color':game.get('color'),'captureRate':int(sp['capture_rate']),'growthRate':{1:'slow',2:'medium',3:'fast',4:'medium-slow',5:'erratic',6:'fluctuating'}[int(sp['growth_rate_id'])],'eggGroups':game.get('eggGroups',speciesEggs[sid]),'isBaby':sp['is_baby']=='1','isLegendary':sp['is_legendary']=='1','isMythical':sp['is_mythical']=='1','speciesGeneration':int(sp['generation_id'])}
 current=byApp.get(m['dexId']);delta={}
 if '-gmax' in name:
  source['heightQualifier']='at-least'
  source['weightHg']=None
  source['weightStatus']='unknown; upstream placeholder is not measured weight'
 else:source['heightQualifier']='exact'
 source['shapeScope']='species; no direct per-form shape table in these game resources'
 if m['id'] in formShapes:
  reviewed=shapeIdentities[m['id']]
  assert (m['name'],sid,name)==(reviewed['currentName'],reviewed['sourceSpeciesId'],reviewed['sourceForm']), f"Form-shape identity changed: {m['id']} {m['name']}"
  source['shape']=formShapes[m['id']]
  source['shapeScope']='form; documented Bulbapedia classification in form-shape-review/review.json'
  seenFormShapes.add(m['id'])
 source['generationScope']='species introduction; selectorGeneration preserves tool placement policy'
 for field in ['types','stats','bst','shape','color','captureRate','growthRate','eggGroups','isBaby','isLegendary','isMythical']:
  if source[field] is not None and current.get(field)!=source[field]:delta[field]={'before':current.get(field),'after':source[field]}
 if m['types']!=source['types']:delta['pickerTypes']={'before':m['types'],'after':source['types']}
 if delta:changes.append({'id':m['id'],'name':m['name'],'dexId':m['dexId'],'changes':delta})
 if 'unknown' in game:unknown.append({'id':m['id'],'name':m['name'],**game})
 inventory.append({'id':m['id'],'name':m['name'],'dexId':m['dexId'],'sourcePokemonId':pid,'sourceSpeciesId':sid,'sourceForm':name,'gamePersonal':game,'metadata':source,'selectorGeneration':m['generation'],'graph':{k:current[k] for k in ['evolutionChainId','evolvesFrom','evolutionStage']},'changes':delta})

# Source values are an explicit audit. No source file is fetched during a build.
assert seenFormShapes==set(formShapes), 'Form-shape identity coverage must be complete'
manifest={'pokeapiRevision':'bc92d3b6029ef1abe9e7ad424c400b338f3c11fe','pkhexRevision':'02c9ec108fe3c96735f6c2397eaebc10e29a049f','files':[{ 'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(S.iterdir()) if p.suffix=='.csv' or p.name.startswith('personal_') and not p.name.endswith('.b64')],'inventoryCount':len(inventory),'unknown':unknown,'gameStatsConflicts':[{'id':10280,'name':'Mega Starmie','pokeapiStats':stats[10280],'gameStats':next(r['metadata']['stats'] for r in inventory if r['id']==10280),'decision':'Direct ZA game personal record, species121 form1, takes precedence'}]}
manifest['formShapes']={'source':'https://bulbapedia.bulbagarden.net/wiki/List_of_Pok%C3%A9mon_by_shape','review':str(shapeReviewPath),'overrides':len(formShapes),'sha256':hashlib.sha256(shapePath.read_bytes()).hexdigest()}
if unknown:raise ValueError('Unresolved game records: '+json.dumps(unknown))
if args.write:
 output={}
 assert len(inventory)==len(cat)==len({r['id'] for r in inventory}), 'Duplicate form identities'
 # One catalog identity per actual shared record; never rewrite a shared local ID from a colliding battle-form ID.
 direct={m['dexId']:r for m,r in zip(cat,inventory) if m['source']=='dex' and m['id']==r['id'] and (m['id']==m['dexId'] or m['id'] in [10179,10180,10191])}
 assert set(direct)==set(byApp), 'Shared record coverage must be complete'
 for appid,r in direct.items():
  row=byApp[appid];values=r['metadata']
  for field in ['types','stats','bst','shape','color','captureRate','growthRate','eggGroups']:
   row[field]=values[field]
 # All live form metadata differences from the resolved biological Dex record.
 for m,r in zip(cat,inventory):
  base=byApp[m['dexId']];values=r['metadata']
  override={field:values[field] for field in ['stats','bst','shape','color','captureRate','growthRate','eggGroups'] if values[field]!=base[field]}
  if override:output[str(m['id'])]=override
 pathlib.Path('src/data/pokemon.json').write_text(json.dumps(shared,separators=(',',':'),ensure_ascii=False)+'\n')
 pathlib.Path('src/favorites/data/formMetadata.json').write_text(json.dumps(output,indent=2)+'\n')
 pathlib.Path('src/favorites/data/formBst.json').write_text(json.dumps(dict(sorted({str(r['id']):r['metadata']['bst'] for r in inventory}.items(),key=lambda pair:int(pair[0]))),indent=2)+'\n')
 (D/'inventory.json').write_text('[\n'+',\n'.join(json.dumps(r,separators=(',',':'),ensure_ascii=False) for r in inventory)+'\n]\n')
 (D/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (D/'corrections.json').write_text(json.dumps(changes,indent=2)+'\n')
 print(f"Audited {len(inventory)} identities; {len(output)} sparse metadata overrides; game unknowns {len(unknown)}")
else:
 print(json.dumps({'entries':len(inventory),'differences':len(changes),'formShapeOverrides':len(seenFormShapes),'unknown':unknown}))
