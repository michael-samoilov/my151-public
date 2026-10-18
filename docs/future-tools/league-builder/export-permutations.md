# League summary export permutations

Historical captures and commands are in this folder's Git history.

The league export button draws a PNG from `src/league/export/exportLeague.ts`. The default picture matches the on-screen Story/Rematch toggle and uses six team columns so sprites are not crowded against the type mark.

Use **Export** in the tool bar. The overlay shows a live preview and layout checkboxes:

| Setting | Effect |
| --- | --- |
| Gym details column | Theme, TM, and badge between the type icon and team sprites on every row. The column is as wide as its widest line, between one team block's width and a cap that fits about 58 characters of theme. |
| Story and rematch side by side | Two team blocks on every row. Every spacer splits into three parts over the details and the two blocks; only **GYM LEADERS** names them `story teams` / `rematch teams`. |

URL query flags (`exportGymDetails=1`, `exportSideBySide=1`) still seed the checkboxes when the overlay opens.
