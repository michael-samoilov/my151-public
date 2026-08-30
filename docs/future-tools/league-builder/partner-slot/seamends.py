"""Variations on 3c: where the seam ends, with both sprites at full size.

Full size is the card's own cell sprite, 3.25rem = 52px -- the size every
other Pokemon on the card gets. Both halves get it, so the seam no longer
decides who is the lesser one by shrinking them; it decides only whether the
pair fits and where each one can sit.

Placement is solved, not drawn. Each sprite wants its centre on the optical
centre of its own partition -- the area centroid of the shape the seam cuts.
The solver puts it there when it can, and otherwise as near to it as the seam
and the slot edges allow, so a half that has to give way gives way by the
smallest amount rather than by a guess.
"""
W, H = 148.0, 204.0
SPRITE = 52.0                    # 3.25rem, the card's own cell sprite
HEAD, NAME = 11.9, 13.0
SIG_MINW, PAR_MINW = 56.3, 45.8  # the headings are wider than the sprite
PAD = 6.0
GAP = 3.0                        # clearance either side of the seam
STEP = 0.5

SIG = {'src': '__SP95__', 'name': 'Onix', 'head': 'SIGNATURE'}
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


def panel(seam, filled):
    (xa, ya), (xb, yb) = seam
    out = [f'<div class="slot dg"><svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
           f'<line x1="{xa:.0f}" y1="{ya:.0f}" x2="{xb:.0f}" y2="{yb:.0f}"/></svg>']
    misses = []
    for upper, occ, text in ((True, SIG, 'SIGNATURE'), (False, PAR, 'PARTNER')):
        solved = place(seam, upper)
        box = solved[1] if solved else place_free(upper)
        if not solved:
            misses.append(overshoot(seam, box, upper))
        out.append(half(box, occ if filled else None, text,
                        head_below=not upper, off=not solved))
    out.append('</div>')
    return ''.join(out), misses


VARIANTS = [
    ('Corner, full', ((W, 0), (0, H)),
     'the seam 3c began with: corner to corner, and the only one that leaves both halves the same shape'),
    ('Corner, high', ((W, 56), (0, H)),
     'the steepest corner that still parts the two unevenly; the partner takes the whole nudge'),
    ('Corner, mid', ((W, 96), (0, H)),
     'past the limit &mdash; a full-size partner reaches 20px into the signature&rsquo;s half'),
    ('Edge seam', ((W, 100), (0, 130)),
     '3c today; it holds the pair, and it costs the partner half the nudge a steep corner does'),
]


def section():
    both, empty, facts = [], [], []
    for name, seam, blurb in VARIANTS:
        p_both, misses = panel(seam, True)
        p_empty, _ = panel(seam, False)
        flag = (f'<span class="miss">crosses by {max(misses):.0f}px</span>' if misses else '')
        both.append(f'<div class="state"><span class="cap">{name}</span>{p_both}{flag}</div>')
        empty.append(f'<div class="state"><span class="cap">{name}</span>{p_empty}</div>')
        su = place(seam, True)
        pu = place(seam, False)
        facts.append((name, blurb, misses,
                      su[0] ** 0.5 if su else None, pu[0] ** 0.5 if pu else None,
                      largest(seam, True), largest(seam, False)))
    rows = ('<p class="sub2">Both filled</p>'
            f'<div class="rail"><div class="states">{"".join(both)}</div></div>'
            '<p class="sub2">Empty</p>'
            f'<div class="rail"><div class="states">{"".join(empty)}</div></div>')
    table = ('<div class="facts f5"><div class="fh">Seam</div><div class="fh">Sig. off-centre</div>'
             '<div class="fh">Par. off-centre</div><div class="fh">Ceiling</div>'
             '<div class="fh">What it costs</div>')
    for name, blurb, misses, ds, dp, ms, mp in facts:
        cell = lambda d: ('&mdash;' if d is None else ('centred' if d < 1 else f'{d:.0f}px'))
        table += (f'<div class="fn">{name}</div><div class="fv">{cell(ds)}</div>'
                  f'<div class="fv">{cell(dp)}</div><div class="fv">{min(ms, mp):.0f}px</div>'
                  f'<div class="fc">{blurb}</div>')
    table += '</div>'
    return rows + table


CODA = 64.0   # 4rem: the most the pair can have with both still near centre


def coda():
    """One panel at the ceiling, for the seam that holds the most.

    52px is what a Pokemon gets in a cell, so it is the honest floor for
    "full size". It is not the most the pair can have. Corner to corner, both
    halves are the same shape, and both sprites reach 64px before either one
    has to leave its own centre by more than a sprite's quarter.
    """
    seam = ((W, 0), (0, H))
    out = []
    for filled in (True, False):
        (xa, ya), (xb, yb) = seam
        p = [f'<div class="slot dg"><svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
             f'<line x1="{xa:.0f}" y1="{ya:.0f}" x2="{xb:.0f}" y2="{yb:.0f}"/></svg>']
        for upper, occ, text in ((True, SIG, 'SIGNATURE'), (False, PAR, 'PARTNER')):
            box = place(seam, upper, CODA)[1]
            p.append(half(box, occ if filled else None, text,
                          head_below=not upper, sprite=CODA))
        p.append('</div>')
        cap = 'Both filled' if filled else 'Empty'
        out.append(f'<div class="state"><span class="cap">{cap}</span>{"".join(p)}</div>')
    return ('<p class="sub2">Corner to corner, at the ceiling</p>'
            f'<div class="rail"><div class="states">{"".join(out)}</div></div>')
