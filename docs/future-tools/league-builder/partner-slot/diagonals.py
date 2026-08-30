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


def block(box, occ, head, sprite, types, align='center'):
    """One half's content, laid out inside a box that clears the seam."""
    x, y, w, h = box
    if occ is None:
        d = min(w, h) * 0.42
        return (f'<div class="hb" style="left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;'
                f'text-align:{align}">'
                f'<span class="hd2">{head}</span>'
                f'<span class="ball" style="width:{d:.1f}px;height:{d:.1f}px;margin:{(h-d)/2-14:.1f}px auto 0">'
                f'</span></div>')
    pills = ''
    if types:
        pills = '<span class="pills">' + ''.join(
            f'<span class="pill" style="background:{TYPE_COLORS[t]}">{t.upper()}</span>' for t in occ['types']
        ) + '</span>'
    return (f'<div class="hb" style="left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;'
            f'text-align:{align}">'
            f'<span class="hd2">{occ["head"]}</span>'
            f'<img class="sp2" src="{occ["src"]}" alt="" style="width:{sprite}px;height:{sprite}px">'
            f'<span class="nm2">{occ["name"]}</span>{pills}</div>')


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
        # A shallow seam, not a corner. A corner triangle big enough for a
        # heading, a sprite, a name and two type pills is not a minor half any
        # more — and a box that reaches past the seam puts the partner's own
        # heading in the signature's territory, which is the first diagonal's
        # mistake wearing a different hat. So the seam is laid at 62/38 and
        # both boxes sit entirely on their own side of it.
        seam = ((W, 100), (0, 130))
        sig_box, par_box = (8, 3, W - 16, 96), (8, 136, W - 16, 62)
        sprite, align = (46 if types else 56), 'center'
    sig_sprite = sprite if kind != 'major' else sprite
    par_sprite = sprite if kind != 'major' else (26 if types else 34)
    (x1, y1), (x2, y2) = seam
    return (f'<div class="slot dg">'
            f'<svg class="seam" viewBox="0 0 {W:.0f} {H:.0f}" aria-hidden="true">'
            f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"/></svg>'
            + block(sig_box, SIG if has_sig else None, 'SIGNATURE', sig_sprite, types, align)
            + block(par_box, PAR if has_par else None, 'PARTNER', par_sprite, types, align)
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
     'the bottom-right corner.',
     'The only one of the three that says which is the ace, and the honest version of it is smaller than it '
     'first looks: a corner triangle big enough for a heading, a sprite, a name and two type pills is not a '
     'minor half any more. So the seam lies at 62/38 and the partner gets a 132 &times; 62 band &mdash; a '
     '34px sprite, or 26px with types on. <i>That may simply be too small for a sprite to read as a '
     'creature.</i>'),
]
