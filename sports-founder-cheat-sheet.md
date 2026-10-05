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
population), held for X turns (30) at PP tier 5 — a turn below #1 or below tier 5 restarts the
hold. The hold is a contest: rivals defend hardest just past #1, and about half the campaigns that
take #1 lose it at least once before winning. Rivals win ground back: near #1 they reclaim your
hardcore fans where they were the incumbent, and their quadrennial world championships lift them
everywhere for a year (v1.17). Play continues past the win: legacy goals, rivals can retake #1, anchor collapse no longer
ends the run, and a Retire option plays a final retrospective.

**Fan Model:** Per country, per sport: Uninterested → Casual (non-exclusive, churns) → Hardcore
(exclusive, sticky; lost only by demotion to casual through specific causes). Poaching is slow and
two-way: where a sport is strong, a few of another sport's hardcore fans demote to casual each
quarter and can then convert. The "other" bucket loses fans this way but never defends.

**Genome:** 10 discrete trait axes × 6 country attributes = affinity. Identity (locked): surface,
equipment, physical profile, field footprint. Rule (evolvable): contact, team size, match length,
scoring frequency, rules complexity, play structure. Each option carries its own accessibility
(wins casuals) and depth (wins hardcores) modifiers, conditioned on country attributes (numeric
conditions relative to the world's average country; every option must help and hurt in real
countries). Rival
similarity = weighted share of matching options. Every combination is legal.

**Countries:** Climate (Tropical / Arid / Temperate / Cold), wealth and urban density (real data →
0–1 via config curves), sport culture (derived from starting fans), media market (population ×
wealth), language (primary + optional secondary sphere), neighbors (land borders + sea links),
continent (6).

**Real-world data (built 2026-09-15):** 213 markets — FIFA's members minus Kosovo and Palestine,
plus Tuvalu, Jersey, Guernsey and the Isle of Man; the UK's four home nations, not the UK. World
Bank 2024 population, GNI per capita (Atlas) and urban share, national statistics offices filling
gaps; GeoNames land borders plus hand-listed sea links; 15 broad language spheres. Soccer/cricket
fan buckets from interest surveys ("very interested" → hardcore), gaps modeled on a named neighbour
and tagged; "other" bucket per-continent default with overrides. `content/sources.yaml` carries
every source and year and is validated at load. Soccer: grass, ball only, endurance, large,
incidental, large team, standard, low scoring, simple, continuous. Cricket: grass, bat, precision,
large, no contact, large team, long, high scoring, intricate, innings.

**Spread:** Casual exposure crosses borders via proximity, language, and media; hardcore is built
locally. Player pushes markets with limited focus slots (more at higher tiers).

**PP Income:** Base income from Fandom Score (diminishing returns) + story/milestone bonuses
collected as clickable map pickups. Costs rise per tier. All numbers in config.

**Business Layer:** Per-country cash. Gate (hardcore × wealth, venue-capped), TV (casual ×
media market), sponsors (reach × wealth); multi-year deals in seasonal windows, some with demands.
Costs: payroll, operations, venues. Cash builds local hardcore via venues/youth, never PP. No
cross-country transfers; PP-funded bailouts. Phase 0: gate + one media/sponsor line.

**Growth Tree:** Branching tree per category (~8–12 nodes), global nodes conditioned on country
attributes, exclusive forks, no refunds, cost = base × current tier multiplier × a size factor that
grows with the sport's own Fandom Score, so a campaign owns about half the tree and which half is
the decision. Phase 0: 20
Grassroots and Media nodes, 4 forks (where to play, roots, TV deal, coverage); a category is
buyable only while the current tier unlocks it (demotion keeps nodes, blocks new buys); conditions
never turn a bonus into a penalty.

**Events:** Moments (auto) + decision cards (capped per turn), built only from recorded sim facts,
using a closed list of effect types. Negative events grow with tier.
Each flagship season ends in a champion moment and at most one story decision (dynasty, underdog,
first title, close finish, repeat final); runaway champions raise pressure cards. Club strength is
the one effect only season cards use.
Pressure drains land on arrival (paying fixes the league, never the drain); season-card cooldowns
count in seasons.

**Time (v1.19):** Turn-based, not real-time. An optional auto-advance (Play / Pause, a few speeds)
ends turns on its own and stops whenever something needs the player; any time, low priority.

**Big and rich markets (v1.21):** A giant is many audiences: genome fit softens with population.
Four wealth levels (Shoestring, Modest, Comfortable, Affluent) weigh Prestige income and where
rivals defend hardest. The race for #1 counts raw fans.

**Sport identity (v1.18):** Name the sport (generated default), the founding club (a real flagship
club in a real town of the anchor) and its ground; birthplace and ethos; what a score, match and
season are called (preset nouns); a preset emblem. A Rulebook page in "Your sport" with almanac
prose and a field diagram. Editor and image export in Phase 2.

**Rivals:** Real-world sports, present day — soccer, cricket, basketball, American football,
baseball, ice hockey, rugby, combat sports, plus a passive "other" bucket. Defense budgets,
per-country escalation (Watching → Defending → Entrenched), closed countermove list. Real sport
names; generic leagues/orgs/teams, all in one moddable names file. Rivals hold their ground: their
real starting shares are home, they never spread or grow past it on their own, and they lose ground
only to the player.

**Rules Evolution:** PP cost, seasonal window only, max 1/year. First build (v1.20): one rule trait
per amendment, priced and punished by the jump; purists turn casual everywhere, more in the anchor,
where the old rule fit better and the older the rule; the review shows price, loss and hints for
the anchor and top five markets; dated amendments in the Rulebook; world proposals come with deals. Backlash scales with hardcore base
and rule age (tradition). Global rulebook. Proposals from player, broadcasters, sponsors,
league directors.

**History:** Permanent landmarks, season summaries, career totals, records, and yearly world
fan snapshots; match detail pruned per season. Headlines may only claim what records prove.
Almanac screen in Phase 2.

**Late-Game Pressure:** Anchor purists resent neglect and TV-friendly rule changes; hardcore fans
age out (yours and rivals', demoting to casual; rivals recruit replacements, you don't; "other"
is exempt); pro leagues cost more and fall faster, with a minimum cost even in tiny countries;
rivals defend hardest when you near #1.

**Leagues:** One top league per country, forming at a hardcore threshold and rising through
Amateur → Semi-Pro → Professional → Elite (player-chosen promotion). One player-assigned flagship
league worldwide, and the player is its commissioner: it starts at the anchor and is the only league
with deep management (named teams, standings, stars, real sponsor and TV deals with demands).
Moving the seat happens only in a seasonal window and costs purists in the old country, whose league
drops to the simple model. Flagship sim depth grows with tier: teams → stars → full rosters
(contracts drive payroll cost, not negotiation); other leagues stay simple. Delegation: standing
policies everywhere; hands-on business only in focus countries; trait-driven league directors
(Phase 1); intervene anywhere anytime. No inbox: the map signals trouble, business happens in
seasonal windows, crises arrive as decision cards.

**Culture:** Never bought. Traditions (derbies, styles of play, nicknames, rites) emerge from real
sim facts and are held by fans in particular countries: they make fans stickier and make them resist
rule changes, cheapening deal demands and seat moves. The Culture tree category nurtures traditions
that exist. Artifacts are traditions that are things: famous venues (earned from finals and
record crowds, never bought; fans resist naming rights and moves; can be lost), the named trophy,
chants, and a homegrown gear brand (a small, demand-free sponsor at the flagship). Founding character at creation (birthplace, ethos, colors and emblem, the sport's own
terms) seeds which traditions form, never affinity.

**Stars:** Full squads at the flagship (later; Phase 1 has one named leading player per club,
whose scores are recorded); a few lazily named standouts in every other league. A season's top
scorer with a big share of their club's scores becomes a star when one of the few star places
(1-4 by tier) is open; stars strengthen their club, age, move up and retire a season after
announcing it. The
player backs a few as faces of the sport (slots grow with PP tier): they drive spread and seed
traditions. Backing takes seasons to pay off; dropping a beloved star costs goodwill; exits can be
honored (final season, retirement, mentoring a successor).

**Loss Condition:** Your starting/anchor country's league fully collapses.

**Setup:** Pick any anchor country (auto 1–5 star difficulty with deadpan reasons) → design
genome with anchor-only hints → name sport and founding club, preset, optional seed. Focus slot
starts on anchor.

**Campaign:** ~10–15 hours to first win (~120 in-game years; you're the founding family).
Replay via anchor country + genome; anchor difficulty rating + Easy/Normal/Hard. Multiple save
slots.

**Phase 1 Systems (playable core):** World map + popularity, sport creation/genome, PP growth
tree, persistent league/team/player sim, event/storytelling generator, rival-sport AI,
business layer (sponsors/TV/Cash), rules-evolution system.

**Phase 2 Systems (later, same build):** Venue growth, Hall of Fame, press coverage,
World Championship (player-founded and named, every 4 years, player picks host), national teams
(best players by nationality), awards, scenarios (YAML data files, scenario-only leaderboards, suspend-save ranked runs with fixed seeds,
Weekly Challenge, ~6–10 at launch incl. 1900 start), 9x16 camera-friendly design pass.

**Legacy & Flavor:** Hall of Fame (auto classes from records; inductees add hardcore stickiness at
home), awards (Player of the Season/Year), press (presentation only, fictional outlets, front
pages). Lightweight versions in Phase 1. Venues and youth programs are league-level 1–5 ratings
bought with cash.

**Economy:** PP (global, sport traits/nodes) → unlocks better Cash opportunities (per-country,
league business). One-directional. 5 PP tiers = "growing pains" tension: Backyard Game → Local
Curiosity → National Pastime → International Sport → Global Religion. Tier-ups need Fandom Score +
a breadth condition; automatic, telegraphed, can't be delayed. Demotion only for sustained severe
failure (wide gap, N-turn countdown, cooldown). League
Health Ladder per country: Healthy → Struggling → Near-Collapse → Collapsed.

**Tone:** Dry sports humor, deadpan, almanac-with-a-wink.

**UI & Onboarding:** Map is home; panels overlay it; every screen one click away. Six map
lenses (fandom, rivals, league health, finances, spread, affinity). Guided first campaign with
Founder's Notebook tips; quick-start genome templates; plain-language tooltips. Steam Deck and
controller from day one. Accessibility baseline (colorblind-safe patterns, scaling, rebinding,
reduced motion). English for EA; 1.0 languages by wishlist geography. Music postponed; SFX late.

**Showing the Sport:** Genome-generated rulebook with dated amendments (Phase 0), field diagram
(Phase 1), player-made logo/ball/kit + 9x16 image export (Phase 2). Markets: FIFA associations
with real sports salience (UK home nations separate; no Kosovo/Palestine; Tuvalu kept);
contested and unlisted land neutral.

**References:** Plague Inc. × Football Manager × Capitalism Lab.

**Stack:** Desktop, Steam target. Solo dev. Open-ended timeline. TypeScript + Electron + PixiJS
(see `sports-founder-tech-plan.md`).

**Design North Stars:**
- The heatmap must be *earned* by story — never let growth feel like a bare number climbing.
- Rival sports are the antidote, not the villain — they defend turf, they don't hunt you.
- Every system serves the inventor→operator arc; if it doesn't, question why it's there.
- Force hard decisions — no refunds, no delaying tier-ups, no dodging growing pains.
- Choose pain — when a design question has an easier and a harsher answer, pick the harsher one.
