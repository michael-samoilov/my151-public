"""Variations on 3c: where the seam ends, and what each end costs.

The seam that ends at the bottom-left CORNER is the one this variant started
with. It is drawn here beside the edge seam that replaced it, at four angles,
with the boxes solved rather than guessed: for each seam the solver walks the
half's free corner and keeps the placement that leaves the largest sprite.
"""
W, H = 148.0, 204.0
SIG = {'src': '__SP95__', 'name': 'Onix', 'head': 'SIGNATURE'}
PAR = {'src': '__SP25__', 'name': 'Pikachu', 'head': 'PARTNER'}

# Content heights: heading 11, name 13, and the gaps around them.
SIG_CHROME, PAR_CHROME = 26, 28
MARGIN = 8


def line_at(seam, x):
    (x1, y1), (x2, y2) = seam
    return y1 + (y2 - y1) * (x - x1) / (x2 - x1)


def solve_partner(seam):
    """The largest sprite the lower-right half can hold, and its box."""
    best = None
    right = W - MARGIN
    for x0 in range(10, int(right) - 30, 2):
        top = line_at(seam, x0) + 4          # the seam is highest at the box's left edge
        height = (H - 4) - top
        width = right - x0
        sprite = min(height - PAR_CHROME, width - 6)
        if sprite <= 0:
            continue
        if best is None or sprite > best[0]:
            best = (sprite, (x0, top, width, height))
    return best


def solve_signature(seam):
    """The largest sprite the upper-left half can hold, and its box."""
    best = None
    for x1 in range(60, int(W - MARGIN) + 1, 2):
        bottom = line_at(seam, x1) - 4       # the seam is lowest at the box's right edge
        height = bottom - 4
        width = x1 - MARGIN
        sprite = min(height - SIG_CHROME, width - 6)
        if sprite <= 0:
            continue
        if best is None or sprite > best[0]:
            best = (sprite, (MARGIN, 4.0, width, height))
    return best


def block(box, occ, head, sprite, head_below=False):
    x, y, w, h = box
    frame = f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;text-align:center'
    if occ is None:
        d = min(w, h) * 0.40
        ball = (f'<span class="ball" style="width:{d:.1f}px;height:{d:.1f}px;'
                f'margin:{max(0.0,(h-d)/2-12):.1f}px auto 0"></span>')
        head_el = f'<span class="hd2">{head}</span>'
        return f'<div class="hb" style="{frame}">{(ball + head_el) if head_below else (head_el + ball)}</div>'
    head_el = f'<span class="hd2">{occ["head"]}</span>'
    body = (f'<img class="sp2" src="{occ["src"]}" alt="" style="width:{sprite:.0f}px;height:{sprite:.0f}px">'
            f'<span class="nm2">{occ["name"]}</span>')
    return f'<div class="hb" style="{frame}">{(body + head_el) if head_below else (head_el + body)}</div>'


def panel(seam, filled):
    sig = solve_signature(seam)
    par = solve_partner(seam)
    (x1, y1), (x2, y2) = seam
    out = [f'<div class="slot dg">'
           f'<svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
           f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"/></svg>']
    if sig:
        out.append(block(sig[1], SIG if filled else None, 'SIGNATURE', sig[0]))
    if par:
        out.append(block(par[1], PAR if filled else None, 'PARTNER', par[0], head_below=True))
    out.append('</div>')
    return ''.join(out), (sig[0] if sig else 0), (par[0] if par else 0)


VARIANTS = [
    ('Corner, high', ((W, 56), (0, H)),
     'the most even corner seam, and the closest a corner gets to the edge seam'),
    ('Corner, mid', ((W, 96), (0, H)),
     '3c as it first stood; every pixel the signature gains here the partner loses'),
    ('Corner, low', ((W, 136), (0, H)),
     'the floor: 14px is not a Pok&eacute;mon any more'),
    ('Edge seam', ((W, 100), (0, 130)),
     'the largest partner of the four, at the same signature as Corner, high'),
]


def section():
    both, empty, facts = [], [], []
    for name, seam, blurb in VARIANTS:
        p_both, s, pr = panel(seam, True)
        p_empty, _, _ = panel(seam, False)
        both.append(f'<div class="state"><span class="cap">{name}</span>{p_both}</div>')
        empty.append(f'<div class="state"><span class="cap">{name}</span>{p_empty}</div>')
        facts.append((name, seam, blurb, s, pr))
    rows = ('<p class="sub2">Both filled</p>'
            f'<div class="rail"><div class="states">{"".join(both)}</div></div>'
            '<p class="sub2">Empty</p>'
            f'<div class="rail"><div class="states">{"".join(empty)}</div></div>')
    table = ('<div class="facts"><div class="fh">Seam</div><div class="fh">Signature</div>'
             '<div class="fh">Partner</div><div class="fh">What it costs</div>')
    for name, seam, blurb, s, pr in facts:
        table += (f'<div class="fn">{name}</div><div class="fv">{s:.0f}px</div>'
                  f'<div class="fv">{pr:.0f}px</div><div class="fc">{blurb}</div>')
    table += '</div>'
    return rows + table
