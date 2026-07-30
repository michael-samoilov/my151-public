# Backlog

Things worth doing that are not being done yet, with enough of the reasoning
that picking one up does not start from scratch.

## A report icon drawn from the Bug type symbol

The report control uses lucide's generic `Bug`. Using the *Pokémon* Bug type
symbol would tie it to the app's own vocabulary.

The conversion is not "outline the symbol's blocks" — that reads as a cluster of
separate shapes. It is the inverse: the gaps between the blocks are the lineart
(the channel between head and wing cases, the wedge between the wing cases, the
notches across the body), and the only thing that traces the blocks themselves
is the single silhouette they collectively make.

A working approach got most of the way there: marching-squares the alpha of
`public/sprites/types/glyph/7.png`, morphologically close it (disk radius 4 —
enough to bridge the 8px wedge, and every pixel past that rounds the silhouette
until it becomes a rounded square), stroke the closed silhouette's outline, then
subtract the blocks back out and stroke the resulting gap regions. Simplify each
loop with Ramer-Douglas-Peucker at ~1.6 source pixels or the 34px source's
staircase shows through, and drop loops under ~6px² or the crumbs where blocks
nearly touch read as dirt.

Where it stalled: at 16px — the size the control actually renders at — the
symbol carries more interior detail than a lucide icon and reads dense. It wants
either a hand-drawn simplification of the traced result or a decision to accept
the density.

Also worth naming: the type symbols are TPC's art, and redrawing one as a UI
icon is a further derivative step than displaying it as a type badge is.
