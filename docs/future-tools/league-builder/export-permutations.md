# League summary export permutations

The league export button draws a PNG from `src/league/export/exportLeague.ts`. The default picture matches the on-screen Story/Rematch toggle and uses six team columns so sprites are not crowded against the type mark.

Use **Export** in the tool bar. The overlay shows a live preview and layout checkboxes:

| Setting | Effect |
| --- | --- |
| Gym details column | Theme, TM, and badge between the type icon and team sprites on every row. |
| Story and rematch side by side | Gym-leader rows only: two team blocks and `story teams` / `rematch teams` on the **GYM LEADERS** spacer. |

URL query flags (`exportGymDetails=1`, `exportSideBySide=1`) still seed the checkboxes when the overlay opens.
