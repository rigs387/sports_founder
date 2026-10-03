# The flagship league

Implemented October 2–3, 2026 (GDD v1.11, v1.13, v1.14). Run `npm.cmd run dev`, start a campaign,
then open **Flagship** in the top bar.

![The flagship screen: this season's table, the latest round, the seat and the champions.](screen.png)

The player is commissioner of one league, the flagship. The anchor's founding league holds the seat
from turn 1. The screen shows:

- **Table:** this season's standings, ranked by points, then score margin, then score for. Each
  club's championships are shown beside its name. In the American format a line marks the playoff
  places.
- **Latest results:** the most recent round. Winners are in bold.
- **The seat:** where the player runs the league. In the seasonal window the seat can move to a
  Professional or Elite league elsewhere. Reviewing the move shows the purist cost: a share of the
  current seat country's hardcore fans turn casual (more when leaving the anchor). The move happens
  when the season ends and can be cancelled before then. A flagship abroad that folds sends the
  seat home for free.
- **Champions:** the last ten seasons with the year, the champion and the runner-up, or the final in
  the American format.

Clubs are based in real towns and cities of their market (`content/places.yaml`, from GeoNames);
only their nicknames are invented. Bigger places host more clubs. The league has 8 clubs at Amateur,
12 at Semi-Pro, 16 at Professional and 20 at Elite; promotion admits expansion clubs at the next
season.

## Season format at creation

![The season format choice on the creation screen.](setup-format.png)

**European:** the top of the table is champion. **American:** the same regular season, then
single-match knockout playoffs for the top 4 clubs (8 from 12 clubs up), higher seed at home. The
format never affects where the sport spreads.

[Narrow layout](narrow.png)

## Implementation and verification

`src/sim/flagship.ts` runs seasons, playoffs, rating drift, seat moves and the snapshot the screen
reads (`TurnSnapshot.flagship`). The flagship rolls its matches on its own random stream, so per-turn
world data is byte-identical with and without it. `src/renderer/src/flagship/FlagshipScreen.tsx`
renders it; the seat move goes through the worker's `applyAction` like every other action.

`tests/flagship.test.ts` covers schedules, both formats, determinism and save/resume, club growth,
seat rules and costs, the free return home and the format 7 → 8 migration. `npm run smoke` starts
an American-format campaign, opens the screen late in the campaign and checks the table, results,
champions, playoff line and both layouts (`runs/smoke/32-flagship.png`, `33-flagship-narrow.png`).
The seat-move controls with eligible targets are not reached in the smoke campaign; their rules are
covered by the simulation tests.
