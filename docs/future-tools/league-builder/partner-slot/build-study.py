import base64
D = 'docs/future-tools/league-builder/partner-slot'
sp = {}
for pid in [95, 25]:
    with open(f'{D}/p{pid}.png', 'rb') as f:
        sp[pid] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()

SIG = ('__SP95__', 'Onix', 'SIGNATURE')
PAR = ('__SP25__', 'Pikachu', 'PARTNER')
W, H = 148.0, 204.0


def face(x, y, w, h, occ, label, size=None, small=False, radius=8):
    st = f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;border-radius:{radius}px'
    if occ is None:
        d = min(w, h) * 0.30
        return (f'<div class="face open" style="{st}">'
                f'<span class="hd" style="top:{5 if small else 7}px">{label}</span>'
                f'<span class="ball" style="left:{(w-d)/2:.1f}px;top:{(h-d)/2:.1f}px;'
                f'width:{d:.1f}px;height:{d:.1f}px"></span></div>')
    src, name, heading = occ
    s = size or min(w * 0.62, h * 0.55)
    cls = 'nm s' if small else 'nm'
    return (f'<div class="face" style="{st}">'
            f'<span class="hd" style="top:{5 if small else 7}px">{heading}</span>'
            f'<img class="sp" src="{src}" alt="" style="left:{(w-s)/2:.1f}px;'
            f'top:{(h-s)/2 - (2 if small else 4):.1f}px;width:{s:.1f}px;height:{s:.1f}px">'
            f'<span class="{cls}" style="bottom:{6 if small else 9}px">{name}</span></div>')


def wedge(side, occ, label):
    clip = 'polygon(0 0, 100% 0, 0 100%)' if side == 'top' else 'polygon(100% 0, 100% 100%, 0 100%)'
    cx = W * (0.34 if side == 'top' else 0.68)
    cy = H * (0.30 if side == 'top' else 0.62)
    st = f'left:0;top:0;width:{W:.1f}px;height:{H:.1f}px;border-radius:8px;clip-path:{clip}'
    bottom_hd = f'<span class="hd" style="right:10px;left:auto;text-align:right;top:{H-15:.1f}px">{label}</span>'
    if occ is None:
        d = 44.0
        hd = (f'<span class="hd" style="left:{cx-52:.1f}px;width:104px;right:auto;top:{cy-38:.1f}px">{label}</span>'
              if side == 'top' else bottom_hd)
        return (f'<div class="face open" style="{st}">{hd}'
                f'<span class="ball" style="left:{cx-d/2:.1f}px;top:{cy-d/2:.1f}px;'
                f'width:{d}px;height:{d}px"></span></div>')
    src, name, heading = occ
    s = 66.0
    hd = (f'<span class="hd" style="left:{cx-52:.1f}px;width:104px;right:auto;top:{cy-52:.1f}px">{heading}</span>'
          if side == 'top'
          else f'<span class="hd" style="right:10px;left:auto;text-align:right;top:{H-15:.1f}px">{heading}</span>')
    return (f'<div class="face" style="{st}">{hd}'
            f'<img class="sp" src="{src}" alt="" style="left:{cx-s/2:.1f}px;top:{cy-s/2+4:.1f}px;'
            f'width:{s}px;height:{s}px">'
            f'<span class="nm s" style="left:{cx-52:.1f}px;width:104px;right:auto;'
            f'top:{cy+38:.1f}px">{name}</span></div>')


def panels(kind):
    out = []
    caps = ['Empty', 'Signature only', 'Partner only', 'Both']
    for i, (hs, hp) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
        inner = []
        if kind == 'stacked':
            hh = (H - 4) / 2
            inner.append(face(0, 0, W, hh, SIG if hs else None, 'SIGNATURE', small=True))
            inner.append(face(0, hh + 4, W, hh, PAR if hp else None, 'PARTNER', small=True))
        elif kind == 'side':
            ww = (W - 4) / 2
            inner.append(face(0, 0, ww, H, SIG if hs else None, 'SIG.', size=ww * 0.86, small=True))
            inner.append(face(ww + 4, 0, ww, H, PAR if hp else None, 'PARTNER', size=ww * 0.86, small=True))
        elif kind == 'diagonal':
            inner.append(wedge('top', SIG if hs else None, 'SIGNATURE'))
            inner.append(wedge('bottom', PAR if hp else None, 'PARTNER'))
            inner.append(f'<svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
                         f'<line x1="{W:.0f}" y1="0" x2="0" y2="{H:.0f}"/></svg>')
        else:
            iw, ih = W * 0.52, H * 0.36
            inner.append(face(0, 0, W, H - ih, SIG, 'SIGNATURE', size=80) if hs
                         else face(0, 0, W, H, None, 'SIGNATURE'))
            ix, iy = W - iw + 6, H - ih + 6
            inner.append(f'<div class="cut" style="left:{ix-3:.1f}px;top:{iy-3:.1f}px;'
                         f'width:{iw+6:.1f}px;height:{ih+6:.1f}px"></div>')
            inner.append(face(ix, iy, iw, ih, PAR if hp else None, 'PARTNER', size=ih * 0.52, small=True))
        out.append(f'<div class="state"><span class="cap">{caps[i]}</span>'
                   f'<div class="slot">{"".join(inner)}</div></div>')
    return '<div class="rail"><div class="states">' + ''.join(out) + '</div></div>'


SECTIONS = [
    ('stacked', 'Two full-width halves',
     'Halving the box across its <b>short</b> side leaves two faces wider than they are tall, which is the '
     'shape a sprite with a name under it wants.',
     'Each half is 148 &times; 100. The sprite gets 96px of width and the name a line of its own, so a long '
     'name still fits on one. The cost is that neither half looks more important than the other &mdash; '
     '<b>nothing here says which of the two is the ace</b>.'),
    ('side', 'Two half-width columns',
     'Halving the <b>long</b> side is the obvious mirror of the first, and it is the one the box’s own '
     'proportions argue against.',
     'Each column is 72 &times; 204. The sprite comes down to about 62px and the name to 9.5px, and anything '
     'longer than “Pikachu” wraps. <i>Most of the height goes unused</i>: the faces are nearly three '
     'times taller than the content they hold.'),
    ('diagonal', 'One box, one seam',
     'A single face cut corner to corner. Both halves keep the <b>full width</b> of the box, so both sprites '
     'stay large.',
     'What they lose is their corners. The lower wedge cannot hold its heading above its sprite &mdash; at '
     'that height the seam has already eaten the left half of the line &mdash; so the heading drops to the '
     'bottom edge and <i>the two halves stop reading in the same order</i>. It is the most distinctive of the '
     'four and the least legible.'),
    ('inset', 'One primary, one inset',
     'The signature keeps the slot it has today; the partner overlaps its bottom-right corner, the way a '
     'powerup disc overlaps a cell.',
     'It is the only one of the four that <b>says which is the ace without a word</b>, and the only one that '
     'costs the signature nothing but the room under its own name. The partner face is 77 &times; 73 &mdash; '
     'smaller than any other option gives it, which is either the point or the objection.'),
]

parts = []
for i, (kind, title, verdict, note) in enumerate(SECTIONS, 1):
    parts.append(f'<section id="s{i}"><h2><span class="idx">{i:02d}</span>{title}</h2>'
                 f'<p class="verdict">{verdict}</p>{panels(kind)}'
                 f'<p class="note">{note}</p></section>')

# The diagonal, revisited: three seams that clip nothing, each with and
# without the Pokemon's types.
import importlib.util
spec = importlib.util.spec_from_file_location(
    'diagonals', '/tmp/claude-0/-home-user-my151/d74790d9-bbfd-5538-8993-a07d19412b2a/scratchpad/diagonals.py')
dg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dg)

dparts = []
for i, (kind, title, verdict, note) in enumerate(dg.VARIANTS, 1):
    # Major and minor drops the type pills entirely, so it has one row.
    rows = (f'{dg.row(kind, False)}' if kind == 'major'
            else f'<p class="sub2">Without types</p>{dg.row(kind, False)}'
                 f'<p class="sub2">With types</p>{dg.row(kind, True)}')
    dparts.append(
        f'<section id="s3{chr(96+i)}"><h2><span class="idx">3{chr(96+i)}</span>{title}</h2>'
        f'<p class="verdict">{verdict}</p>{rows}'
        f'<p class="note">{note}</p></section>')

TEMPLATE = open('/tmp/claude-0/-home-user-my151/d74790d9-bbfd-5538-8993-a07d19412b2a/scratchpad/partner-template.html').read()
# The three seams are variants of section 03, so they follow it. Numbering
# them 3a-3c and then printing them below 04 sent the reader past four
# screens of the page looking for something that was two above.
INTRO = (
    '<section class="intro"><h2>The diagonal, revisited</h2>'
    '<p class="verdict">The seam above cuts its own halves: the lower one loses its heading, and the two '
    'stop reading in the same order. These three keep a seam and give each half a rectangle that fits '
    'entirely inside it, so <b>nothing is clipped</b>.</p></section>'
)
# Where the seam ends: the corner seams this variant started with, beside the
# edge seam that replaced them -- both sprites at the card's own full size.
spec_mv = importlib.util.spec_from_file_location(
    'seamends', '/tmp/claude-0/-home-user-my151/d74790d9-bbfd-5538-8993-a07d19412b2a/scratchpad/seamends.py')
mv = importlib.util.module_from_spec(spec_mv)
spec_mv.loader.exec_module(mv)
SEAM_END = (
    '<section id="s3d"><h2><span class="idx">3d</span>Where the seam ends</h2>'
    '<p class="verdict">3c began with a seam that ran to the <b>bottom-left corner</b>. It was replaced by '
    'one that crosses to the left edge instead. Here are three corner seams beside that edge seam, each '
    'giving both halves a Pok&eacute;mon at the size the card would really draw it.</p>'
    '<p class="note"><b>Each half is sized on its own.</b> Holding the two to one shared size sounds fair '
    'and is not: one size means the smaller half sets it, so the seam drags the signature down to whatever '
    'the partner can take. Each half gets the largest sprite its own partition holds instead, rounded to the '
    'rem grid. The floor is <b>52px</b> &mdash; <code>SPRITE_REM</code>, the sprite a Pok&eacute;mon gets in '
    'a team cell &mdash; because a signature smaller than an ordinary cell is the thing this section exists '
    'to avoid. The ceiling to beat is <b>92px</b>, what the slot gives one Pok&eacute;mon today.</p>'
    '<p class="note">Each sprite then wants its centre on the <b>optical centre of its own partition</b>: '
    'the area centroid of the shape the seam cuts out of the slot. The solver puts it there when it can, and '
    'otherwise as near to it as the seam and the slot edges allow &mdash; so a half that has to give way '
    'gives way by the smallest amount rather than by a guess. Size and centring trade against each other at '
    'about <b>3px of centring per 4px of sprite</b>, so the last column is the price of the two before it.'
    '</p>'
    + mv.section() +
    '<p class="note"><b>Corner, high is the pick.</b> It puts the signature at 80px, within 12px of the '
    '92px it has to itself today, while the partner keeps a full team-cell sprite at 52px. Nothing in the '
    'slot is smaller than a Pok&eacute;mon anywhere else on the card, and the split still says which of the '
    'two is the ace without a word.<br><br>'
    'The other three price that choice. <i>Corner, full</i> is the only seam that cuts the slot into the '
    'same shape twice, so both halves land on 64px and neither is the lesser one &mdash; which is the '
    'argument against it as much as for it. <i>Edge seam</i> splits the difference at 76 and 56, and is the '
    'only one that gives the partner more than a cell. <i>Corner, mid</i> is past the limit: its partner '
    'solves to 36px, so it is drawn at the 52px floor and flagged, to show how far into the signature a '
    'full-size partner would have to reach.</p></section>'
)
running = parts[:3] + [INTRO] + dparts + [SEAM_END] + parts[3:]
html = TEMPLATE.replace('__SECTIONS__', '\n\n  '.join(running))
html = html.replace('__SP95__', sp[95]).replace('__SP25__', sp[25])
open('/tmp/claude-0/-home-user-my151/d74790d9-bbfd-5538-8993-a07d19412b2a/scratchpad/partner-slot.html', 'w').write(html)
print('written', len(html), 'bytes')
