"""Variations on 3c: where the seam ends, and what each end gives each half.

The seam is a drawn line, not a wall. A block's far corner is allowed 4px past
it, because that corner holds the transparent margin of a sprite rather than
any ink -- and buying those 4px back costs the sprite 4px it would show.

Sizing is per half, not shared. An earlier pass held both halves to one size,
which sounds fair and is not: one size means the smaller half sets it, so the
seam drags the signature down to whatever the partner can take. Here each
half gets the largest sprite its own partition holds, and 52px -- SPRITE_REM,
the sprite a Pokemon gets in a team cell -- is the floor. A half that cannot
reach the floor is drawn at it and flagged, because a sprite smaller than a
cell is the thing this whole section is trying to avoid.

Placement is solved, not drawn. Each sprite wants its centre on the optical
centre of its own partition -- the area centroid of the shape the seam cuts.
The solver puts it there when it can, and otherwise as near to it as the seam
and the slot edges allow, so a half that has to give way gives way by the
smallest amount rather than by a guess.
"""
W, H = 148.0, 204.0
FLOOR = 52.0                     # 3.25rem = SPRITE_REM, a team cell's sprite
SLOT_TODAY = 92.0                # 5.75rem, what this slot gives one Pokemon
SPRITE = FLOOR                   # the default when a caller names no size
HEAD, NAME = 11.9, 13.0
SIG_MINW, PAR_MINW = 73.0, 45.8  # measured one-line widths of the two headings
PAD = 6.0
GAP = -4.0                       # the block's far corner may cross the seam by this
MAX_CROSS = 4.0                  # ...and the drawing has to hold it to that
STEP = 0.5

SIG = {'src': '__SP95__', 'name': 'Onix', 'head': 'ACE POK\u00c9MON'}
PAR = {'src': '__SP25__', 'name': 'Pikachu', 'head': 'PARTNER'}


def line_at(seam, x):
    (xa, ya), (xb, yb) = seam
    return ya + (yb - ya) * (x - xa) / (xb - xa)


def clip(poly, seam, keep_above):
    """Sutherland-Hodgman: the part of the polygon on one side of the seam."""
    (xa, ya), (xb, yb) = seam
    def side(p):
        v = (xb - xa) * (p[1] - ya) - (yb - ya) * (p[0] - xa)
        return v if keep_above else -v
    out = []
    for i, cur in enumerate(poly):
        prv = poly[i - 1]
        sc, sp = side(cur), side(prv)
        if sc >= 0:
            if sp < 0:
                t = sp / (sp - sc)
                out.append((prv[0] + t * (cur[0] - prv[0]), prv[1] + t * (cur[1] - prv[1])))
            out.append(cur)
        elif sp >= 0:
            t = sp / (sp - sc)
            out.append((prv[0] + t * (cur[0] - prv[0]), prv[1] + t * (cur[1] - prv[1])))
    return out


def centroid(poly):
    """The area centroid: the optical centre of the partition."""
    a = cx = cy = 0.0
    for i, (x1, y1) in enumerate(poly):
        x2, y2 = poly[(i + 1) % len(poly)]
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    a /= 2
    return (cx / (6 * a), cy / (6 * a))


def place(seam, upper, sprite=SPRITE):
    """The block position whose SPRITE centre sits nearest the centroid.

    The block is heading + sprite + name; which end the heading sits at
    changes where the sprite's centre falls inside it, so the solver works in
    sprite-centre coordinates rather than block-corner ones.
    """
    w = max(sprite, SIG_MINW if upper else PAR_MINW)
    h = sprite + HEAD + NAME
    tx, ty = centroid(clip([(0, 0), (W, 0), (W, H), (0, H)], seam, upper))
    # The sprite's centre, measured down from the block's top.
    off = HEAD + sprite / 2 if upper else sprite / 2
    best = None
    y = PAD
    while y + h <= H - PAD:
        x = PAD
        while x + w <= W - PAD:
            # The binding corner is the one nearest the seam.
            cx_, cy_ = (x + w, y + h) if upper else (x, y)
            room = (line_at(seam, cx_) - cy_) if upper else (cy_ - line_at(seam, cx_))
            if room >= GAP:
                d = (x + w / 2 - tx) ** 2 + (y + off - ty) ** 2
                if best is None or d < best[0]:
                    best = (d, (x, y, w, h), (tx, ty))
            x += STEP
        y += STEP
    return best


def largest(seam, upper):
    lo, hi = 8.0, 120.0
    while hi - lo > 0.25:
        mid = (lo + hi) / 2
        if place(seam, upper, mid): lo = mid
        else: hi = mid
    return lo


def place_free(upper, sprite=SPRITE):
    """Where the block would sit with the slot alone to answer to.

    A seam that cannot hold the pair still has to be drawn, and drawing it at
    a size the seam does allow would hide the finding rather than show it. So
    the block keeps full size and takes the slot's own corner; the panel then
    shows exactly how far into the other half it reaches.
    """
    w = max(sprite, SIG_MINW if upper else PAR_MINW)
    h = sprite + HEAD + NAME
    return ((PAD, PAD, w, h) if upper else (W - PAD - w, H - PAD - h, w, h))


def overshoot(seam, box, upper):
    """How far the block's binding corner reaches past the seam, in pixels."""
    x, y, w, h = box
    cx_, cy_ = (x + w, y + h) if upper else (x, y)
    room = (line_at(seam, cx_) - cy_) if upper else (cy_ - line_at(seam, cx_))
    return max(0.0, GAP - room)


def block(box, occ, sprite=SPRITE):
    """One half's content: heading, sprite, name -- filled or empty.

    The empty state is the filled state with the sprite taken out and its
    square left in place, so the heading and the name keep the position they
    have once a Pokemon lands there. Drawing the ring on its own moved the
    word up against it, which is a different layout wearing the same name.
    """
    x, y, w, h = box
    frame = (f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;text-align:center')
    below = occ is not None and occ['head'] == 'PARTNER'
    if occ is None:
        below = False
    head = f'<span class="hd2">{occ["head"] if occ else ""}</span>'
    return frame, head, below


def half(box, occ, head_text, head_below, sprite=SPRITE, off=False):
    x, y, w, h = box
    frame = f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px'
    cls = 'hb off' if off else 'hb'
    head = f'<span class="hd2">{head_text}</span>'
    if occ is None:
        d = sprite * 0.70
        body = (f'<span class="ph" style="width:{sprite:.0f}px;height:{sprite:.0f}px">'
                f'<span class="ball" style="width:{d:.0f}px;height:{d:.0f}px"></span></span>'
                f'<span class="nm2">&nbsp;</span>')
    else:
        body = (f'<img class="sp2" src="{occ["src"]}" alt="" '
                f'style="width:{sprite:.0f}px;height:{sprite:.0f}px">'
                f'<span class="nm2">{occ["name"]}</span>')
    inner = (body + head) if head_below else (head + body)
    return f'<div class="{cls}" style="{frame}">{inner}</div>'


def sized(seam, upper):
    """The sprite this half gets, and whether the seam can actually hold it.

    Rounded down to 4px so the drawn sizes land on the rem grid the card uses
    and so the block keeps a little slack to move toward its own centre with.
    """
    m = largest(seam, upper)
    s = max(FLOOR, (m // 4) * 4)
    return s, m >= FLOOR


def panel(seam, filled):
    (xa, ya), (xb, yb) = seam
    out = [f'<div class="slot dg"><svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
           f'<line x1="{xa:.0f}" y1="{ya:.0f}" x2="{xb:.0f}" y2="{yb:.0f}"/></svg>']
    stats = []
    for upper, occ, text in ((True, SIG, 'ACE POK\u00c9MON'), (False, PAR, 'PARTNER')):
        size, ok = sized(seam, upper)
        solved = place(seam, upper, size) if ok else None
        box = solved[1] if solved else place_free(upper, size)
        out.append(half(box, occ if filled else None, text,
                        head_below=not upper, sprite=size, off=not ok))
        stats.append({'size': size, 'ok': ok,
                      'off': solved[0] ** 0.5 if solved else None,
                      'miss': None if ok else overshoot(seam, box, upper)})
    out.append('</div>')
    return ''.join(out), stats


VARIANTS = [
    ('Corner, full', ((W, 0), (0, H)), False,
     'corner to corner: the only seam that halves the slot into the same shape twice, '
     'so the two get the same sprite without either being held to it'),
    ('Corner, high', ((W, 56), (0, H)), True,
     'the ace within 8px of the 92px it has to itself today, and the partner '
     'comfortably past a team-cell sprite'),
    ('Corner, mid', ((W, 96), (0, H)), False,
     'past the limit: the partner solves to 36px, under a team cell, and is drawn at '
     'the floor to show how far into the signature that reaches'),
    ('Edge seam', ((W, 100), (0, 130)), False,
     '3c today; it splits the difference, and it is the only one that gives the '
     'partner more than a cell'),
]


def section():
    both, empty, facts = [], [], []
    for name, seam, pick, blurb in VARIANTS:
        p_both, stats = panel(seam, True)
        p_empty, _ = panel(seam, False)
        misses = [st['miss'] for st in stats if st['miss']]
        flag = f'<span class="miss">crosses by {max(misses):.0f}px</span>' if misses else ''
        tag = '<span class="pick">chosen</span>' if pick else ''
        both.append(f'<div class="state"><span class="cap">{name}{tag}</span>{p_both}{flag}</div>')
        empty.append(f'<div class="state"><span class="cap">{name}</span>{p_empty}</div>')
        facts.append((name, pick, blurb, stats))
    rows = ('<p class="sub2">Both filled</p>'
            f'<div class="rail"><div class="states">{"".join(both)}</div></div>'
            '<p class="sub2">Empty</p>'
            f'<div class="rail"><div class="states">{"".join(empty)}</div></div>')
    table = ('<div class="facts f5"><div class="fh">Seam</div><div class="fh">Ace</div>'
             '<div class="fh">Partner</div><div class="fh">Off centre</div>'
             '<div class="fh">What it gives</div>')
    for name, pick, blurb, stats in facts:
        sg, pr = stats
        cell = lambda st: (f'{st["size"]:.0f}px' if st['ok'] else f'{st["size"]:.0f}px<span class="no"> ?</span>')
        offs = ' / '.join('centred' if st['off'] is not None and st['off'] < 1
                          else ('&mdash;' if st['off'] is None else f'{st["off"]:.0f}px')
                          for st in stats)
        table += (f'<div class="fn">{name}{" &#9679;" if pick else ""}</div>'
                  f'<div class="fv">{cell(sg)}</div><div class="fv">{cell(pr)}</div>'
                  f'<div class="fv">{offs}</div><div class="fc">{blurb}</div>')
    table += '</div>'
    return rows + table
