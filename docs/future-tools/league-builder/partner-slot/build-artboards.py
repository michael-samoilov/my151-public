"""Artboards for a signature + partner slot, at the card's own geometry."""
import json, os, textwrap

OUT = 'docs/future-tools/league-builder/partner-slot'

# The card, at a 390px frame (1rem = 16px), from CardGrid.tsx.
CARD_X, CARD_W = 8, 375
PAD_X, PAD_Y, BAND_H, ROW_H = 8, 11, 20, 54
INSET_X, INSET_Y = 3, 6
COL = (CARD_W - 2 * PAD_X) / 7
SLOT_X = CARD_X + PAD_X + INSET_X
SLOT_Y = PAD_Y + BAND_H + INSET_Y          # relative to the card's own top
SLOT_W = 3 * COL - 2 * INSET_X
SLOT_H = 4 * ROW_H - 2 * INSET_Y

BAND = '#6c684f'      # a rock card's band
CELL = '#a8a487'
SLOT_BG = '#ffffff'
DASH = '#c0bdab'
GROUND = '#f9f9fa'

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
           -webkit-font-smoothing: antialiased; color: #1b1f24; }
    .board { position: relative; background: #eceef1; overflow: hidden; }
    .ttl { position: absolute; font-size: 13px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.3; }
    .sub { position: absolute; font-size: 10.5px; line-height: 1.5; color: #57606b; }
    .sub b { color: #1b1f24; }
    .cap { position: absolute; font-size: 9.5px; font-weight: 800; letter-spacing: 0.05em; color: #57606b; }
    .note { position: absolute; font-size: 9.5px; line-height: 1.45; color: #57606b; }
    .note b { color: #1b1f24; }
    .card { position: absolute; background: #f9f9fa; border-radius: 12px;
            box-shadow: 0 1px 3px rgba(15,23,42,0.10); overflow: hidden; }
    .band { position: absolute; border-radius: 5px; background: %s; color: #fff;
            font-size: 8.5px; font-weight: 800; letter-spacing: 0.06em;
            display: flex; align-items: center; padding: 0 9px; }
    .cell { position: absolute; background: #fff; border-radius: 6px; }
    .glyph { position: absolute; border-radius: 6px; background: %s; color: #fff;
             display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }
    .slot { position: absolute; background: #fff; border-radius: 8px; overflow: hidden; }
    .empty { position: absolute; border: 1px dashed %s; border-radius: 8px;
             background: rgba(255,255,255,0.65); }
    .lbl { position: absolute; left: 0; right: 0; text-align: center; font-size: 8.5px;
           font-weight: 800; letter-spacing: 0.08em; color: %s; }
    .nm { position: absolute; left: 0; right: 0; text-align: center; font-size: 11px; font-weight: 500; }
    .nms { position: absolute; left: 0; right: 0; text-align: center; font-size: 9.5px; font-weight: 500; }
    .sp { image-rendering: pixelated; display: block; position: absolute; }
    .ball { position: absolute; border-radius: 50%%; border: 1.5px dashed %s; }
    .foot { position: absolute; left: 0; right: 0; bottom: 0; padding: 9px 14px 11px; background: #fff;
            border-top: 1px solid #dde1e6; font-size: 10px; line-height: 1.55; color: #48515c; }
    .foot b { color: #0e7490; }
    .tag { position: absolute; display: inline-flex; align-items: center; height: 16px; padding: 0 6px;
           border-radius: 9999px; font-size: 8.5px; font-weight: 800; letter-spacing: 0.05em; }
  </style>
</helmet>
""" % (BAND, CELL, DASH, BAND, DASH)

TAIL = "</x-dc>\n</body>\n</html>\n"


def sprite(src, x, y, size):
    return f'<img src="{src}" class="sp" style="left:{x:.1f}px;top:{y:.1f}px;width:{size}px;height:{size}px">'


def filled(x, y, w, h, src, name, label, sprite_size=None, small=False, radius=8, clip=None):
    """One occupied half: the white face, its heading, its sprite and its name."""
    s = sprite_size or min(w * 0.62, h * 0.55)
    style = f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;border-radius:{radius}px'
    if clip:
        style += f';clip-path:{clip}'
    out = [f'<div class="slot" style="{style}">']
    out.append(f'<div class="lbl" style="top:{7 if not small else 5}px">{label}</div>')
    out.append(sprite(src, (w - s) / 2, (h - s) / 2 - (2 if small else 4), s))
    cls = 'nms' if small else 'nm'
    out.append(f'<div class="{cls}" style="bottom:{9 if not small else 6}px">{name}</div>')
    out.append('</div>')
    return ''.join(out)


def blank(x, y, w, h, label, small=False, radius=8, clip=None):
    style = f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;border-radius:{radius}px'
    if clip:
        style += f';clip-path:{clip}'
    d = min(w, h) * 0.30
    return (f'<div class="empty" style="{style}">'
            f'<div class="lbl" style="top:{7 if not small else 5}px">{label}</div>'
            f'<div class="ball" style="left:{(w-d)/2:.1f}px;top:{(h-d)/2:.1f}px;width:{d:.1f}px;height:{d:.1f}px"></div>'
            f'</div>')


def wedge(x, y, w, h, clip, side, occupant, label):
    """One half of a diagonal split, laid out inside its own triangle."""
    # The centroid of a right triangle sits a third of the way in from its
    # right angle; nudged toward the corner so the sprite clears the seam.
    cx = w * (0.34 if side == 'top' else 0.68)
    cy = h * (0.30 if side == 'top' else 0.62)
    style = (f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;'
             f'border-radius:8px;clip-path:{clip}')
    if occupant is None:
        d = 44.0
        head = (f'<div class="lbl" style="left:{cx-52:.1f}px;width:104px;top:{cy-38:.1f}px">{label}</div>'
                if side == 'top'
                else f'<div class="lbl" style="left:0;right:10px;text-align:right;top:{h-16:.1f}px">{label}</div>')
        return (f'<div class="empty" style="{style}">' + head +
                f'<div class="ball" style="left:{cx-d/2:.1f}px;top:{cy-d/2:.1f}px;'
                f'width:{d}px;height:{d}px"></div></div>')
    src, name, heading = occupant
    s = 66.0
    if side == 'top':
        head = f'<div class="lbl" style="left:{cx-52:.1f}px;width:104px;top:{cy-52:.1f}px">{heading}</div>'
    else:
        # A centred heading above the sprite cannot fit in the lower wedge:
        # at that height the seam has already eaten its left half. It goes to
        # the bottom edge instead, where the wedge is finally full width —
        # which means the two halves cannot share one reading order.
        head = (f'<div class="lbl" style="left:0;right:10px;text-align:right;'
                f'top:{h-16:.1f}px">{heading}</div>')
    return (f'<div class="slot" style="{style}">' + head
            + sprite(src, cx - s / 2, cy - s / 2 + 4, s) +
            f'<div class="nms" style="left:{cx-52:.1f}px;width:104px;top:{cy+38:.1f}px">{name}</div>'
            f'</div>')


def card_context(left, top, height=None):
    """The slice of card the slot sits in: the band, the glyph column, two team cells."""
    h = height or (SLOT_Y + SLOT_H + 14)
    out = [f'<div class="card" style="left:{left}px;top:{top}px;width:{CARD_W}px;height:{h}px">']
    out.append(f'<div class="band" style="left:{PAD_X + INSET_X}px;top:{PAD_Y}px;'
               f'width:{CARD_W - 2*(PAD_X + INSET_X)}px;height:{BAND_H}px">GYM LEADER TEAM</div>')
    for row in range(4):
        y = SLOT_Y + row * ROW_H
        seats = [2, 3, 3, 3][row]
        for seat in range(1, seats + 1):
            cx = PAD_X + (7 - seat) * COL + INSET_X
            out.append(f'<div class="cell" style="left:{cx:.1f}px;top:{y:.1f}px;'
                       f'width:{COL - 2*INSET_X:.1f}px;height:{ROW_H - 2*INSET_Y:.1f}px"></div>')
    out.append('</div>')
    return ''.join(out)


def panel(x, y, title, body):
    return (f'<div class="cap" style="left:{x}px;top:{y}px">{title}</div>' + body)


def board(name, title, sub, w, h, content, foot):
    html = HEAD + f'<div class="board" style="width:{w}px;height:{h}px">'
    html += f'<div class="ttl" style="left:24px;top:18px;width:{w-48}px">{title}</div>'
    html += f'<div class="sub" style="left:24px;top:{18+ (34 if "<br>" in title else 20)}px;width:{w-48}px">{sub}</div>'
    html += content
    html += f'<div class="foot">{foot}</div>'
    html += '</div>' + TAIL
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(html)


# ---------------------------------------------------------------- geometries
SIG = ('p95.png', 'Onix', 'SIGNATURE')
PAR = ('p25.png', 'Pikachu', 'PARTNER')

def geometry_panels(kind, ox, oy):
    """The four states of one geometry, laid out in a row."""
    out = []
    gap = 26
    for i, (has_sig, has_par) in enumerate([(False, False), (True, False), (False, True), (True, True)]):
        x = ox + i * (SLOT_W + gap)
        out.append(f'<div class="cap" style="left:{x:.1f}px;top:{oy-16}px">'
                   f'{["EMPTY","SIGNATURE ONLY","PARTNER ONLY","BOTH"][i]}</div>')
        out.append(f'<div style="position:absolute;left:{x:.1f}px;top:{oy}px;'
                   f'width:{SLOT_W:.1f}px;height:{SLOT_H:.1f}px;background:{GROUND};border-radius:9px"></div>')
        if kind == 'stacked':
            hh = (SLOT_H - 4) / 2
            out.append(filled(x, oy, SLOT_W, hh, *SIG, small=True) if has_sig
                       else blank(x, oy, SLOT_W, hh, 'SIGNATURE', small=True))
            out.append(filled(x, oy + hh + 4, SLOT_W, hh, *PAR, small=True) if has_par
                       else blank(x, oy + hh + 4, SLOT_W, hh, 'PARTNER', small=True))
        elif kind == 'side':
            ww = (SLOT_W - 4) / 2
            out.append(filled(x, oy, ww, SLOT_H, *SIG, sprite_size=ww * 0.86, small=True) if has_sig
                       else blank(x, oy, ww, SLOT_H, 'SIG.', small=True))
            out.append(filled(x + ww + 4, oy, ww, SLOT_H, *PAR, sprite_size=ww * 0.86, small=True) if has_par
                       else blank(x + ww + 4, oy, ww, SLOT_H, 'PARTNER', small=True))
        elif kind == 'diagonal':
            up = 'polygon(0 0, 100% 0, 0 100%)'
            lo = 'polygon(100% 0, 100% 100%, 0 100%)'
            # Each wedge holds its content at its own centre of area, not the
            # box's — centring both on the box puts both sprites on the seam.
            out.append(wedge(x, oy, SLOT_W, SLOT_H, up, 'top', SIG if has_sig else None, 'SIGNATURE'))
            out.append(wedge(x, oy, SLOT_W, SLOT_H, lo, 'bottom', PAR if has_par else None, 'PARTNER'))
            # the seam itself
            out.append(f'<div style="position:absolute;left:{x:.1f}px;top:{oy}px;width:{SLOT_W:.1f}px;'
                       f'height:{SLOT_H:.1f}px;pointer-events:none">'
                       f'<svg width="{SLOT_W:.0f}" height="{SLOT_H:.0f}">'
                       f'<line x1="{SLOT_W:.0f}" y1="0" x2="0" y2="{SLOT_H:.0f}" '
                       f'stroke="#dfe2e6" stroke-width="2"/></svg></div>')
        elif kind == 'inset':
            iw, ih = SLOT_W * 0.52, SLOT_H * 0.36
            # The signature keeps its whole face, but its name has to rise
            # clear of the inset's top edge — the room the inset costs.
            out.append(filled(x, oy, SLOT_W, SLOT_H - ih, *SIG, sprite_size=80, radius=8) if has_sig
                       else blank(x, oy, SLOT_W, SLOT_H, 'SIGNATURE'))
            ix, iy = x + SLOT_W - iw + 6, oy + SLOT_H - ih + 6
            wrap = (f'<div style="position:absolute;left:{ix-3:.1f}px;top:{iy-3:.1f}px;'
                    f'width:{iw+6:.1f}px;height:{ih+6:.1f}px;background:{GROUND};border-radius:11px"></div>')
            out.append(wrap)
            out.append(filled(ix, iy, iw, ih, *PAR, sprite_size=ih * 0.52, small=True, radius=8) if has_par
                       else blank(ix, iy, iw, ih, 'PARTNER', small=True, radius=8))
    return ''.join(out)


GEOMETRIES = [
    ('Stacked', 'stacked', 'Two full-width halves',
     'The box is portrait — 148 x 204 at a 390px frame — so halving it across the short side keeps both faces '
     'wider than they are tall. Each sprite gets 96px of width and its name a line of its own.'),
    ('SideBySide', 'side', 'Two half-width columns',
     'Halving the long side gives each face 72px of width. The sprite has to come down to about 62px, and a '
     'name longer than "Pikachu" wraps or truncates.'),
    ('Diagonal', 'diagonal', 'One box, one seam',
     'Both faces keep the full width of the box, so both sprites stay large. What they lose is their corners. '
     'The lower wedge cannot even hold its heading above its sprite — at that height the seam has eaten the '
     'left half of the line — so it drops to the bottom edge, and the two halves stop reading in the same '
     'order.'),
    ('Inset', 'inset', 'One primary, one inset',
     'The signature keeps the slot it has today and the partner overlaps its bottom-right corner, the way the '
     'powerup discs overlap a cell. It says which of the two is the ace without a word — and it is the only '
     'one of the four that costs the signature nothing but the room under its own name.'),
]

W = 24 + 4 * (SLOT_W + 26) + 24
for file, kind, subtitle, note in GEOMETRIES:
    body = geometry_panels(kind, 24, 118)
    body += (f'<div class="note" style="left:24px;top:{118 + SLOT_H + 22}px;width:{W-48}px">{note}</div>')
    board(f'{file}.dc.html',
          f'Signature + partner &middot; {subtitle}',
          'The four states the slot can be in, at the card\'s own geometry. A partner is not restricted to the '
          'team, so the pair can be off-type.',
          int(W), int(118 + SLOT_H + 96),
          body,
          'A partner chosen while an evolution line is free is <b>still seated</b> in that line. Only a partner '
          'chosen on a full card lives in the slot alone.')

# ------------------------------------------------------------------- the ask
main_body = card_context(24, 118)
main_body += (f'<div style="position:absolute;left:{24 + SLOT_X - CARD_X:.1f}px;'
              f'top:{118 + SLOT_Y:.1f}px;width:{SLOT_W:.1f}px;height:{SLOT_H:.1f}px;'
              f'border:2px dashed #0e7490;border-radius:9px"></div>')
main_body += (f'<div class="tag" style="left:{24 + SLOT_X - CARD_X:.1f}px;'
              f'top:{118 + SLOT_Y + SLOT_H + 8:.1f}px;background:#0e7490;color:#fff">'
              f'148 x 204 &middot; 3 columns x 4 rows</div>')
main_body += ('<div class="note" style="left:430px;top:118px;width:300px">'
              'The slot the two would share is the card\'s top-left void: <b>three columns wide and four rows '
              'tall</b>, which is portrait by a third. That shape is what separates the four geometries — '
              'halving it across the short side leaves two landscape faces, halving it along the long side '
              'leaves two narrow ones.<br><br>'
              'The <b>partner is not restricted to the team</b>. Where the signature picker locks to the card\'s '
              'own lines once the template is full, the partner picker stays open to all 1,025 — a partner is '
              'the leader\'s companion, not their sixth Pokémon.<br><br>'
              'It is still seated when there is room: choosing one while an evolution line is free places it '
              'there, so a partner on a five-line card becomes the sixth line AND the partner. On a full card '
              'it lives in the slot alone.</div>')
board('Main.dc.html', 'The slot the two would share',
      'What the geometry has to fit before any of the four splits is worth arguing about.',
      760, int(118 + SLOT_Y + SLOT_H + 120), main_body,
      'Four geometries follow, each in all four states: <b>empty</b>, <b>signature only</b>, '
      '<b>partner only</b>, <b>both</b>.')

boards = [{'file': 'Main.dc.html', 'title': 'The slot the two would share', 'x': 0, 'y': 0,
           'w': 760, 'h': int(118 + SLOT_Y + SLOT_H + 120)}]
y = int(118 + SLOT_Y + SLOT_H + 120) + 80
for i, (file, kind, subtitle, note) in enumerate(GEOMETRIES):
    boards.append({'file': f'{file}.dc.html', 'title': f'Split &middot; {subtitle}',
                   'x': 0, 'y': y, 'w': int(W), 'h': int(118 + SLOT_H + 96)})
    y += int(118 + SLOT_H + 96) + 80
with open(os.path.join(OUT, 'canvas.json'), 'w') as f:
    json.dump({'artboards': boards}, f, indent=2)
print('wrote', len(boards), 'boards; slot is', round(SLOT_W, 1), 'x', round(SLOT_H, 1))
