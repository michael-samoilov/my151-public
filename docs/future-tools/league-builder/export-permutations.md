# League summary export permutations

The league export button draws a PNG from `src/league/export/exportLeague.ts`. The default picture matches the on-screen Story/Rematch toggle and uses six team columns so sprites are not crowded against the type mark.

Optional layouts are controlled with URL query flags until the export-settings pane ships:

| Flag | Effect |
| --- | --- |
| `exportGymDetails=1` | Adds a gym-details column (theme, TM, badge) between the type icon and the team sprites on every row. |
| `exportSideBySide=1` | On gym-leader rows only, draws story and rematch teams in two blocks with a gap between them. The **GYM LEADERS** spacer also shows right-aligned `story teams` and `rematch teams` labels over each block. |

Flags combine. Example preview URL:

`/league?exportGymDetails=1&exportSideBySide=1`

Open the league builder with those parameters, then use **Export league** in the tool bar.
