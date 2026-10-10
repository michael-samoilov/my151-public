import copy
import json
import re
import xml.etree.ElementTree as E
from pathlib import Path

D = Path(__file__).parent
NS = '{http://www.w3.org/2000/svg}'
E.register_namespace('', NS[1:-1])
selections = json.loads((D / 'selections.json').read_text())
sheet = E.parse(D / 'sources/elginive/Pokemon-Gen9-Type-Icons.svg').getroot()
icons = sheet.find(f"{NS}g[@id='Icons']")
order = ['grass', 'fire', 'water', 'electric', 'flying', 'poison', 'rock', 'normal', 'ground', 'dark', 'steel', 'psychic', 'bug', 'fighting', 'ice', 'ghost', 'dragon', 'fairy']
output = []
for name, selection in selections.items():
    if selection['source'] == 'partywhale':
        source = E.parse(D / f'sources/partywhale/{name}.svg').getroot()
        css = ''.join(el.text or '' for el in source.iter(NS + 'style'))
        fills = dict(re.findall(r'\.(cls-\d+)\s*\{\s*fill:\s*(#[\da-fA-F]+)', css))
        whites = set()
        for cls, color in fills.items():
            color = color[1:]
            if len(color) == 3:
                color = ''.join(c * 2 for c in color)
            if min(int(color[k:k + 2], 16) for k in [0, 2, 4]) > 200:
                whites.add(cls)
        children = [el for el in source if el.tag != NS + 'defs' and not (el.tag == NS + 'circle' and el.get('r') == '128')]
    else:
        whites = {'st21'}
        children = [icons[order.index(name)]]
    group = E.Element(NS + 'g', {'id': 'source-glyph'})
    for child in children:
        child = copy.deepcopy(child)
        for el in child.iter():
            cls = el.attrib.pop('class', '')
            if cls:
                el.set('fill', '#fff' if cls in whites else '#000')
        group.append(child)
    output.append(dict(name=name, **selection, body=E.tostring(group, encoding='unicode')))
print(json.dumps(output))
