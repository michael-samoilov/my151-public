"""The diagonal, three ways, with the seam clipping nothing.

Each variant gives both halves a rectangular content box that fits entirely
inside its own side of the seam, so no heading or name is ever cut. Both
halves keep the same reading order — heading, sprite, name, types — which the
first diagonal could not.
"""
W, H = 148.0, 204.0
TYPE_COLORS = {'rock': '#AFA981', 'ground': '#945121', 'electric': '#FAC000'}

SIG = {'src': '__SP95__', 'name': 'Onix', 'head': 'SIGNATURE', 'types': ['rock', 'ground']}
PAR = {'src': '__SP25__', 'name': 'Pikachu', 'head': 'PARTNER', 'types': ['electric']}


def block(box, occ, head, sprite, types, align='center', head_below=False):
    """One half's content, laid out inside a box that clears the seam.

    `head_below` puts the heading under the sprite and the name instead of
    over them. It is for the half that sits against the seam: a heading is
    full-width text and a sprite is not, so leading with the sprite keeps the
    widest thing in the block away from the edge the two halves share.
    """
    x, y, w, h = box
    frame = (f'left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;text-align:{align}')
    if occ is None:
        d = min(w, h) * 0.42
        ball = (f'<span class="ball" style="width:{d:.1f}px;height:{d:.1f}px;'
                f'margin:{(h-d)/2-14:.1f}px auto 0"></span>')
        head_el = f'<span class="hd2">{head}</span>'
        inner = (ball + head_el) if head_below else (head_el + ball)
        return f'<div class="hb" style="{frame}">{inner}</div>'
    pills = ''
    if types:
        pills = '<span class="pills">' + ''.join(
            f'<span class="pill" style="background:{TYPE_COLORS[t]}">{t.upper()}</span>' for t in occ['types']
        ) + '</span>'
    head_el = f'<span class="hd2">{occ["head"]}</span>'
    body = (f'<img class="sp2" src="{occ["src"]}" alt="" style="width:{sprite}px;height:{sprite}px">'
            f'<span class="nm2">{occ["name"]}</span>{pills}')
    inner = (body + head_el) if head_below else (head_el + body)
    return f'<div class="hb" style="{frame}">{inner}</div>'


def variant(kind, has_sig, has_par, types):
    """One panel: the seam, and both halves' content boxes."""
    if kind == 'quarters':
        seam = ((W, 0), (0, H))
        sig_box, par_box = (7, 6, 64, 96), (W - 71, H - 102, 64, 96)
        sprite, align = (46 if types else 54), 'center'
    elif kind == 'bands':
        # A centred column rather than the full width. The seam sweeps 72px of
        # height as it crosses the box, so a full-width band has to clear the
        # seam's *lowest* point and loses all of it; a 90px column only has to
        # clear the seam where it actually sits.
        seam = ((W, 66), (0, 138))
        sig_box, par_box = (29, 4, 90, 74), (29, 126, 90, 74)
        sprite, align = (36 if types else 46), 'center'
    else:  # major / minor
        # No type pills here, and the partner's heading sits under its sprite
        # rather than over it. Both are the same economy: the seam is what
        # limits this variant, so the less full-width text the minor half
        # carries near it, the further into its own corner the block can sit
        # — and the more room is left over for the sprite. Dropping the pills
        # and moving the heading took the partner from 26px to 44.
        seam = ((W, 100), (0, 130))
        # The binding constraint for a full-width box is the seam at its
        # RIGHT edge (101.6 here), not its left: the seam runs down to the
        # left, so the box's far corner meets it first.
        sig_box, par_box = (8, 4, W - 16, 94), (40, 124, 100, 76)
        sprite, align = 68, 'center'
    sig_sprite = sprite
    par_sprite = sprite if kind != 'major' else 44
    (x1, y1), (x2, y2) = seam
    below = kind == 'major'
    return (f'<div class="slot dg">'
            f'<svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
            f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"/></svg>'
            + block(sig_box, SIG if has_sig else None, 'SIGNATURE', sig_sprite, types, align)
            + block(par_box, PAR if has_par else None, 'PARTNER', par_sprite, types, align,
                    head_below=below)
            + '</div>')


def row(kind, types):
    caps = ['Empty', 'Signature only', 'Partner only', 'Both']
    cells = []
    for i, (hs, hp) in enumerate([(0, 0), (1, 0), (0, 1), (1, 1)]):
        cells.append(f'<div class="state"><span class="cap">{caps[i]}</span>'
                     f'{variant(kind, hs, hp, types)}</div>')
    return '<div class="rail"><div class="states">' + ''.join(cells) + '</div></div>'


VARIANTS = [
    ('quarters', 'Corner quarters',
     'The 45&deg; seam kept, and each half given the largest rectangle that fits inside its own triangle '
     '&mdash; 64 &times; 96, at its own corner. Nothing is cut, and the two halves are exact mirrors.',
     'The sprite comes down to 46px with types on, which is the smallest of the three. In exchange this is '
     'the only variant where both halves are identical in size, so neither reads as the lesser one.'),
    ('bands', 'Shallow bands',
     'The seam laid almost flat, so each half is a landscape band the full width of the box rather than a '
     'triangle. Content is centred in the band and never approaches the seam.',
     'It is the stacked split with an angled join &mdash; which is either the point, if the angle is what '
     'you wanted, or the objection, if the diagonal was meant to give the halves different weights. The '
     'content is a 90px column rather than the full width, because a full-width band has to clear the seam '
     'at its lowest point and loses all 72px the seam sweeps on its way across.'),
    ('major', 'Major and minor',
     'The seam cuts one corner off: the signature keeps a full-width trapezoid at the top, the partner takes '
     'the bottom-right corner. No type pills, and the partner\'s heading sits <b>under</b> its sprite.',
     'Both of those are the same economy. The seam is what limits this variant, so the less full-width text '
     'the minor half carries near it, the further into its own corner the block can sit &mdash; which is room '
     'the sprite gets back. Measured: the partner\'s sprite went from 26px with pills and a heading on top to '
     '<b>44px</b>, and the signature\'s from 46px to <b>68px</b>, on the same 62/38 seam.'),
]
