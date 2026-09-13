# Sports Founder — Cheat Sheet

**Core Fantasy:** An underdog visionary turns a backyard game into a global religion, one earned
story at a time.

**Player Role:** The Naismith of your sport — inventor first, operator second, inventor identity
never fully retires (rules can always be revisited).

**Primary Loop:** Global layer spends PP on growth nodes; country layer handles operator decisions
(sponsors, rules responses, rivalries).

**Turn Structure:** Turn length set by PP tier — quarters at tier 1 (inventor era), up to years at
the top (operator era). The sim always steps quarterly underneath. Turns always complete; league
health moves at most one step per turn, so collapse always gets a warning turn.

**Win Condition:** #1 sport by global Fandom Score (hardcore + weighted casual fans, raw
population), held for X turns. Play continues past the win: legacy goals, rivals can retake #1,
anchor collapse no longer ends the run, and a Retire option plays a final retrospective.

**Fan Model:** Per country, per sport: Uninterested → Casual (non-exclusive, churns) → Hardcore
(exclusive, sticky; lost only by demotion to casual through specific causes).

**Genome:** ~10 discrete trait axes × 6 country attributes = affinity. Accessibility traits win
casuals; depth traits win hardcores. Identity traits locked; rule traits evolvable.

**Spread:** Casual exposure crosses borders via proximity, language, and media; hardcore is built
locally. Player pushes markets with limited focus slots (more at higher tiers).

**PP Income:** Base income from Fandom Score (diminishing returns) + story/milestone bonuses
collected as clickable map pickups. Costs rise per tier. All numbers in config.

**Events:** Moments (auto) + decision cards (capped per turn), built only from recorded sim facts,
using a closed list of effect types. Negative events grow with tier.

**Rivals:** Real-world sports, present day — soccer, cricket, basketball, American football,
baseball, ice hockey, rugby, combat sports, plus a passive "other" bucket. Defense budgets,
per-country escalation (Watching → Defending → Entrenched), closed countermove list. Real sport
names; generic leagues/orgs/teams, all in one moddable names file.

**Rules Evolution:** PP cost, seasonal window only, max 1/year. Backlash scales with hardcore base
and rule age (tradition). Global rulebook. Proposals from player, broadcasters, sponsors,
commissioners.

**History:** Permanent landmarks, season summaries, career totals, records, and yearly world
fan snapshots; match detail pruned per season. Headlines may only claim what records prove.
Almanac screen in Phase 2.

**Late-Game Pressure:** Anchor purists resent neglect and TV-friendly rule changes; hardcore fans
age out; pro leagues cost more and fall faster; rivals defend hardest when you near #1.

**Leagues:** One top league per country, forming at a hardcore threshold and rising through
Amateur → Semi-Pro → Professional → Elite (player-chosen promotion). One player-assigned flagship
league worldwide. Sim depth grows with tier: fans only → teams → stars → full rosters (contracts
drive payroll cost, not negotiation). Delegation: standing policies everywhere; hands-on business
only in focus countries; trait-driven commissioners (Phase 1); intervene anywhere anytime. No inbox: the map signals trouble, business happens in seasonal windows,
crises arrive as decision cards.

**Loss Condition:** Your starting/anchor country's league fully collapses.

**Campaign:** ~10–15 hours to first win (~120 in-game years; you're the founding family).
Replay via anchor country + genome; anchor difficulty rating + Easy/Normal/Hard. Multiple save
slots.

**Phase 1 Systems (playable core):** World map + popularity, sport creation/genome, PP growth
tree, persistent league/team/player sim, event/storytelling generator, rival-sport AI,
business layer (sponsors/TV/Cash), rules-evolution system.

**Phase 2 Systems (later, same build):** Venue growth, Hall of Fame, press coverage,
World Cup/Olympics (scripted, every 4 years), national teams, awards, custom
scenarios + Steam leaderboards, 9x16 camera-friendly design pass.

**Economy:** PP (global, sport traits/nodes) → unlocks better Cash opportunities (per-country,
league business). One-directional. 5 PP tiers = "growing pains" tension: Backyard Game → Local
Curiosity → National Pastime → International Sport → Global Religion. Tier-ups need Fandom Score +
a breadth condition; automatic, telegraphed, can't be delayed. Demotion only for sustained severe
failure (wide gap, N-turn countdown, cooldown). League
Health Ladder per country: Healthy → Struggling → Near-Collapse → Collapsed.

**Tone:** Dry sports humor, deadpan, almanac-with-a-wink.

**Showing the Sport:** Genome-generated rulebook with dated amendments (Phase 0), field diagram
(Phase 1), player-made logo/ball/kit + 9x16 image export (Phase 2). Markets follow sports-body
conventions (e.g., UK home nations separate); contested areas neutral.

**References:** Plague Inc. × Football Manager × Capitalism Lab.

**Stack:** Desktop, Steam target. Solo dev. Open-ended timeline. TypeScript + Electron + PixiJS
(see `sports-founder-tech-plan.md`).

**Design North Stars:**
- The heatmap must be *earned* by story — never let growth feel like a bare number climbing.
- Rival sports are the antidote, not the villain — they defend turf, they don't hunt you.
- Every system serves the inventor→operator arc; if it doesn't, question why it's there.
