# Sports Founder — Technical & Production Plan
*Version 1.0 | September 12, 2026*

---

## 0. About This Document

**What this is:** The technical and production companion to `sports-founder-gdd.md`. The GDD is the
design contract (what the game is). This plan covers how it gets built: stack, architecture,
phasing, estimates, guardrails, risks, and commercial approach.

**What this is not:** Build tickets. Those come later, per phase.

**Who reads it:** The developer, and every AI coding session. The rules in Section 10 are intended to
be copied into the project's `CLAUDE.md` when the codebase is created.

**Development model:** Solo developer who does not write code directly and instead designs and
steers AI implementation. Every decision below is weighed by how it plays out under that model:
can the AI do the work through text files, can it run and verify its own work, and do mistakes
surface before playtesting or during it.

---

## 1. Decision Log

| Date | Decision | Status |
|---|---|---|
| 2026-09-12 | Stack: **TypeScript + Electron** | Decided |
| 2026-09-12 | Rendering: **PixiJS v8** for the world map and animation | Decided |
| 2026-09-23 | Pixi map reaffirmed after SVG visual studies: PixiJS + pixi-viewport + @pixi/react for the live map; React/CSS for the main screen and cards. Use Natural Earth v5.1.2 map-units with explicit sporting-market assignments instead of world-atlas's sovereign-country boundaries. Offline projected geometry is committed; session history supplies country trends. See `docs/world-map/production.md`. | Decided |
| 2026-09-12 | Architecture: **pure, deterministic, headless simulation core** separate from the UI | Decided |
| 2026-09-12 | Add a **Phase 0 vertical slice** ahead of GDD Phase 1 | Recommended |
| 2026-09-12 | Supporting libraries per Section 6 | Recommended; confirm at project setup |
| 2026-09-12 | Electron/Steam version policy per Section 8 | Decided |
| 2026-09-13 | GDD design questions resolved through Phase 2 systems (GDD v1.1+) | Decided |
| 2026-09-13 | Steam integration deferred until the game is playable | Decided |
| 2026-09-13 | Genome trait list, option-level lever modifiers, identity/rule split, similarity measure (GDD v1.3) | Decided |
| 2026-09-13 | Country attribute definitions, neighbors, continents (GDD v1.3) | Decided |
| 2026-09-13 | Real-world data: salient FIFA markets, World Bank sources, survey-based fan buckets, rival genomes (GDD v1.3) | Decided |
| 2026-09-13 | Differentiation exit criterion ranks top-10 countries by Fandom Score ÷ population | Decided |
| 2026-09-13 | Hardcore poaching between sports: slow, two-way demotion to casual, then normal conversion (GDD v1.4) | Decided |
| 2026-09-13 | Phase 0 growth tree: 20 Grassroots/Media nodes, 4 forks, buying by current tier, conditions never flip sign (GDD v1.5) | Decided |
| 2026-09-13 | Generational turnover: player and rivals age out to casual, rivals recruit replacements, "other sports" exempt; minimum league running cost per tier (GDD v1.5) | Decided |
| 2026-09-13 | Holistic design rule "choose pain": the harsher answer wins open design questions (GDD v1.5) | Decided |
| 2026-09-13 | Pacing targets apply to typical-size anchors; big anchors are slower by design (GDD v1.5) | Decided |
| 2026-09-13 | Differentiation overlap on the placeholder world accepted; re-judge on real data | Decided |
| 2026-09-14 | Campaign turn budget: Backyard Game ~40 turns, Local Curiosity ~10 (GDD v1.5) | Decided |
| 2026-09-14 | Genome balance: options checked against real countries; numeric conditions relative to the world's average country; dominance judged on global Fandom Score (GDD v1.5) | Decided |
| 2026-09-14 | No-dominant-genome check: 250 genomes per anchor, flagged only beyond sampling noise | Decided |
| 2026-09-15 | Real-world dataset: 213 markets (FIFA members minus Kosovo and Palestine, plus Tuvalu, Jersey, Guernsey and the Isle of Man); World Bank 2024 population, GNI per capita (Atlas) and urban share; GeoNames land borders; `content/sources.yaml` validated at load | Decided |
| 2026-09-15 | Experiments that sweep anchors use a deterministic sample of `balanceTargets.experimentAnchors` markets (12) spread across the population range; `--anchors all` still plays every market | Decided |
| 2026-09-15 | The hard-anchor criterion runs on `balanceTargets.hardAnchor` (Tuvalu), not the smallest market | Decided |
| 2026-09-15 | Content validation rejects a market whose hardcore shares exceed `worldChecks.maxSportCulture` (0.75) | Decided |
| 2026-09-16 | Rebalanced for the real world: language and media spread weights cut (65 language links per market against 5 neighbours), tier 4 and tier 5 Fandom Score thresholds raised to the GDD turn budget | Decided |
| 2026-09-18 | Win condition built: #1 held 36 turns at PP tier 5 (GDD v1.7); winning never ends a campaign; save format 6 | Decided |
| 2026-09-18 | Rivals hold their ground: real starting shares are each rival's home level (GDD v1.7) | Decided |
| 2026-09-18 | The hard-anchor criterion counts wins, with the builder bot in the default bot list; pacing adds the first win (target turn 180) | Decided |
| 2026-09-18 | Genome condition deltas scaled ×1.75 (base deltas untouched): steeper geography restores differentiation to 6/6 after rivals stopped filling rival-thin markets | Tuning |
| 2026-09-19 | The win hold is a real contest: about half the campaigns that take #1 lose it before winning (GDD v1.8); near-top rival defense rebuilt to reach it, win hold 36 → 30 turns | Decided |
| 2026-09-19 | Growth node prices scale with the sport's Fandom Score (GDD v1.9): a campaign owns ~half the tree (median 9 of 16) instead of all of it, and strategies own different halves. Base node costs ×0.5, effect amounts ×1.6, player casual/hardcore conversion 0.25→0.3 and 0.012→0.015 to hold the GDD turn budget | Decided |
| 2026-09-19 | Genome condition deltas ×1.25 again (×2.19 in all; ice is at the lever ceiling): the contested hold's late-game defense had eroded differentiation to 5/6. Tier-3 score gate 600k → 400k; grass and moderate-rules deltas trimmed (options: stop-start and short now marginal, lower bound 42%) | Tuning |
| 2026-09-26 | The player is commissioner of the flagship league (GDD v1.11), after playtesting found the slice thin. The seat starts at the anchor and moves only in a seasonal window at a purist cost. League and business depth (system 4 teams/standings/stars, system 7 deals with demands) is built for the flagship only; other leagues keep the Phase 0 model. Hired per-country delegates are renamed league directors | Decided |
| 2026-09-26 | Culture, founding character and stars (GDD v1.12), drawing on God of Sport's v1.9 lesson that bought culture isn't felt. Traditions emerge from sim facts (closed type vocabulary), help and constrain; the Culture tree category nurtures them. Founding character (birthplace, ethos, colors/emblem, terms) seeds culture, not affinity. Backed stars ("faces of the sport") with Champions-style commitment; full squads at the flagship, lazy named standouts elsewhere. Suggested build order: stars, creation color, then culture | Decided |
| 2026-09-26 | Artifacts are tradition types (GDD v1.12): famous venues (earned from facts, founding ground named at creation, help and constrain, can be lost), named trophy, chants/anthems, homegrown gear brand (small demand-free flagship sponsor); films/books later as flavor. Fame is never bought | Decided |
| 2026-10-02 | Commissioner's seat rules (GDD v1.13): only Professional or Elite leagues can take the seat (the anchor holds it from turn 1 at any tier); a folded non-anchor flagship returns the seat to the anchor at once, free, outside the seasonal window | Decided |
| 2026-10-02 | Flagship season (GDD v1.14): 8/12/16/20 clubs by league tier, expansion clubs on promotion; European (table) or American (playoffs) format chosen at creation; club ratings drift and pull toward league finances; moving the seat demotes hardcore fans in the country left behind, more at the anchor | Decided |
| 2026-10-03 | Flagship season as event cards (GDD v1.15): a champion moment every season (tier-scaled PP, no moment slot); at most one story decision per season (dynasty, underdog, first title, close finish, repeat final), offered first and counted against the decision cap; runaway or fourth-straight champions raise pressure cards; new `clubRating` effect valid only on flagship season cards; effects stay in the flagship country | Decided |
| 2026-10-03 | Season card list (GDD v1.15): champion, dynasty, underdog, first title, close finish, repeat final, runaway and foregone-league cards with config starting values; pressure drains land on arrival and paying never cancels them; fixed priority (pressure, then rarest); season-card cooldowns counted in seasons; American runaway needs the playoff champion to top the table; bot weights for every card, then remeasure the win contest | Decided |
| 2026-10-03 | Testing is time-boxed: concise tests whose results we see over thorough ones that never finish. Unit tests have a 30 s timeout (suite ~30 s); the runner states its plan, prints progress and stops early when projected past `--max-minutes` (default 5). Experiment defaults cut to finish in minutes (12 sampled anchors with 5 seeds each, 40 genomes per anchor, 15 naive-bot seeds, 3 bots); `--anchors all` removed. A 5-anchor sample was tried and misread the win contest (19% vs 36%): spread beats repetition. Replaces the 250-genome size above | Decided |
| 2026-10-03 | Flagship stars (GDD v1.16): one named leading player per club (born in real places, invented per-language-sphere names, hidden skill on a career curve; full squads deferred); every score credited to the leading player or the squad; a score is the sport's one scoring unit and the scoring frequency trait sets match chances; a season's top scorer becomes a star by taking a config share of their club's scores when a star place is open (1/2/3/4 by league tier); stars add club strength, backed stars add casual conversion at home and media reach out of the flagship; careers peak, decline and announce retirement a season ahead; stars move up within the flagship; backing slots by PP tier, window only, one-time PP price, influence over seasons, honorable endings and a cash price to keep a backed star; star cards; save format 10. Build plan: 2.6 | Decided |
| 2026-10-04 | Culture, first build (GDD v1.22): six types from recorded facts (derby, club rite, star legacy, national name, famous venue, trophy); strength renews and decays, loss by facts or betrayal, landmarks both ways; weight cuts the player's hardcore turnover and rival poaching/reclaim; venue pilgrimage and champion PP; each tradition remembers its rulebook and offending amendments multiply backlash and wear it; seat moves and trophy renames cost more where traditions are held; birthplace biases births, ethos betrayals, balanced near 1; rivals carry flavor-only content traditions; Culture tree category (strength, reach, protection, hold; Heritage trust / Living game fork). Save format 18. Build plan: 2.11 | Decided |
| 2026-10-05 | Flagship broadcast (GDD v1.23): the seat league multiplies media reach out of its country by (1 + tier ceiling × season interest × health); interest is read from the last season summary (gripping, ordinary, dynasty, runaway/foregone); a season-end pulse on the same channel, none after runaways; a Near-Collapse flagship drains casual fans where its reach lands; stacks with backed stars; balance target 5–15% of world media exposure and one win-contest remeasure. Talent pull parked until other leagues have named players. Build plan: 2.12 | Decided |
| 2026-10-05 | Broadcast revised after measuring (GDD v1.27): the flagship lifts all media reach into the markets its seat's media reaches (× link ÷ strongest), not only the seat's own outbound media, which measured 0–5% and faded to 0.1% late. Ceilings 0.05 / 0.07 / 0.1 / 0.16; 9–12% for seats in large media markets | Decided |
| 2026-10-05 | Flagship deals, topic 1 (GDD v1.28): flagship only; without deals a share of today's media line; a deal locks a value set at signing (PP-tier cap) for 1–5 seasons; one TV slot, sponsor slots by league tier (main first, gear brand an option), naming rights per founding or famous ground; 2–3 offers per open slot each offseason on the flagship's stream; renewal at market value with a loyalty edge; no early exit but a broken demand. Demands, links and guard still to decide; no build plan yet | Decided |
| 2026-10-05 | Flagship deals, topic 2 (GDD v1.28): demands are rule change, tier floor, seat lock and TV exclusivity; they never block, doing the thing (or a forced breach) breaks the deal: remaining value lost, ~one season's value in cash, the partner shuns you for a few seasons; demands raise offers, the gear brand is demand-free and smallest; naming rights on a famous or founding ground is a betrayal on signing | Decided |
| 2026-10-05 | Flagship deals, topic 3 (GDD v1.28): signed deals survive countermoves; a seat-country lockout shrinks new sponsor offers and blocks renewals, a rival broadcast deal leaves no TV offers; the TV fork shapes TV offers (Pay-TV bigger and often exclusive, Free-to-Air smaller, never exclusive); no new cash spend, a full ordinary slate ≈ 100–120% of today's media line; rule demands one step by partner kind, Rulebook shows the due season; bots take the best offer per slot, runner reports signings, demands met and breaches | Decided |
| 2026-10-05 | Flagship deals, topic 4 (GDD v1.28): Deals section on the offseason screen, read-only card on the Flagship tab; a breach is a big moment, due rule demands flagged, renewals marked, term endings toasts; invented partner names; save format 20 (format 19 migrates with none, baseline cut from its next offseason); guard: a full ordinary slate 100–120% of the replaced media line by tier, pacing and contest, Near-Collapse rate reported. Rule demands rare and never required: every slot always has an offer without one, at most one per offseason, none while one is due. Build plan: 2.15 | Decided |
| 2026-10-06 | Deal clauses (GDD v1.29): rule demands measured a bust (bots broke 97%), kept at half the chance; partners want the product through soft clauses: competitive balance for TV (no runaway or foregone season), a star at the seat for sponsors, fans not falling for any partner; judged each season end: met = bonus and a bigger renewal edge, two misses in a row = the partner walks without penalty; a chance and a premium per offer, a clause-free offer always available. Build plan: 2.16 | Decided |
| 2026-10-05 | Living time and the offseason (GDD v1.24), after the first playtest: Play / Pause with three speeds over End Turn, the date ticking quarter by quarter, auto-pause on the interrupt list and decisions with resume after answering; cards revealed at their fact's quarter as event windows over the map (presentation only; a mid-turn sim stop is parked); the seasonal window renamed the offseason, opening on the first turn after the season ends, with one screen for the season review and all league business, prices against PP on hand; backing stays 60 PP. Build plan: 2.13 | Decided |
| 2026-10-05 | Moments have weight (GDD v1.26): minor (toast), big (back-page window) and headline (front page over a dimmed map) per card in content; big flagship moments become headlines at Professional and Elite; card families look different; big moments come first and cannot be skipped (Next Turn waits); auto-collect for minor moments parked. Build plan: 2.14 | Decided |
| 2026-10-05 | The clock is dropped after playtest (GDD v1.25): built as step 3 and played, the quarter-by-quarter replay was choppy and the self-pauses jarring; reverted the same day. Next Turn stays with tier-scaled lengths, the date heads the bottom bar, and cards pop up over the map after each turn in the order they happened. Build plan 2.13 revised | Decided |

---

## 2. Build Phasing & Estimates

### 2.1 Phase 0 — Vertical Slice (new, precedes GDD Phase 1)

**Purpose:** Prove the core fantasy is fun before investing in the most expensive systems. At
spare-time pace, the GDD's Phase 1 alone is 2.7–5.5 years before the core loop can be tested. Phase 0
answers "is the spreading heatmap fun?" in under a year.

**Scope:**
- World map + popularity spread model
- Sport genome with ~10 traits and a genome × country affinity model
- Small PP growth tree
- 1–2 rival sports as simple pressure
- 40–60 event cards
- Abstract leagues (health ladder and numbers only; no individual players)
- Anchor-country collapse loss condition
- Headless sim runner + seeded RNG
- ~~One Steam test achievement~~ — deferred 2026-09-13: no Steam work until the game itself exists

**Estimate:** ~300–500 hours. At 10 hrs/week, roughly 8–12 months.

**Exit criteria (decided 2026-09-13):** The developer playtests extensively; there are no formal
external human playtest gates. Phase 0 exits when heavy headless balancing meets the following
starting targets (thresholds adjustable as data arrives):

- **Genome differentiation:** with anchor and seeds held constant, contrasting genomes share fewer
  than half of their top-10 fandom countries, verified across many seeds. Countries are ranked by
  Fandom Score ÷ population, so the measure shows where the sport caught on rather than which
  countries are largest (decided 2026-09-13; the raw-score ranking is still reported). On the
  26-country placeholder world, overlap between presets that both favor its small cold/temperate
  bloc is accepted; the criterion is judged for real on the real-world dataset (decided 2026-09-13).
- **No dominant genome:** no single trait option appears in more than 40% of top-quartile runs,
  judged on 250 random genomes per anchor, and only beyond sampling noise (the 95% lower bound of
  its share must exceed 40%) (decided 2026-09-14).
  - *A watch item, not an exit gate (decided 2026-09-22).* Steps 5, 7 and 9 each chased this number
    and each found the cause was arithmetic rather than design: climate conditions that were a flat
    global handicap, base deltas carrying free level, and a geometric tax on any option that
    committed to a trade. Every one was a real bug worth fixing, and none of them was anything a
    player could feel — a player plays one sport, not 250 random genomes ranked by top-quartile
    share. The criterion measures whether the design space is degenerate, which is necessary but is
    not evidence of fun, and it cannot become that however many campaigns are run. It stays
    reported on every options run and stops blocking the phase. Revisit it once events and the map
    exist and real people have played: both will move the balance anyway, so precision tuning ahead
    of them is partly wasted.
- **No safe anchor:** every anchor country has a nonzero collapse rate under a naive strategy,
  judged on the sampled anchors (decided 2026-09-15).
- **Hard anchors are winnable:** the best bot wins from Tuvalu (config
  `balanceTargets.hardAnchor`) some of the time. A win is the GDD win condition: #1 held for
  `win.holdTurns` turns at tier 5 (decided 2026-09-18).
- **Pacing:** time to each PP tier, and to the first win (~180 turns), falls within ±30% of the GDD
  campaign budget table, measured on typical-size anchors (the middle half of countries by population); tiny and huge anchors are
  harder by design (decided 2026-09-13).
- **Rivals persist:** no rival is ever fully eliminated.
- **Determinism:** identical seed and inputs produce identical complete state, including after a
  mid-campaign save/load.
- **Performance:** a 120-year headless campaign completes within a set time budget; the 120-year
  save size benchmark is recorded.

**Bot playtesters:** strategy bots act only through the same legal actions as the player. Starting
set: random, greedy-spread, anchor-turtle, media-rush. Every outcome is reported, including losses
— never silently counted as a pass. Candidate addition: AI-agent playtesters that play through the
real UI and report confusion or unexplained outcomes.

**Carried into the next phase as named gaps (2026-09-22).** Two things the bots measure that a
player really would feel, neither of them genome content:

1. **The win hold is only half a contest.** GDD v1.8 asks that about half the campaigns that reach
   #1 lose it before winning; the rate is 36%. Whether the endgame is a fight or a timer is a felt
   property. The knob is `rivalAI` intensity.
2. **Five growth nodes are automatic.** `backyard-clinics`, `word-of-mouth`, `weekend-leagues`,
   `fan-meetups` and `local-radio` are bought past the dominance limit by every bot — builder,
   media-rush, anchor-turtle and greedy-spread alike. GDD v1.9 exists to make the tree a decision,
   and the first five purchases of every campaign are not one. The knob is growth tree content:
   prices, prerequisites or forks on the early grassroots spine.

Phase 0 work is not throwaway — it becomes the foundation of Phase 1.

### 2.2 Estimates by System (experienced solo dev, including design iteration)

| Area | Hours |
|---|---|
| Core infrastructure (turn engine, save/load, data pipeline, UI framework) | 150–300 |
| 1. World map + popularity/spread model | 150–300 |
| 2. Sport genome + creation UI | 100–200 |
| 3. PP growth tree (system + content) | 80–150 |
| 4. Tiered league/team/player simulation | 200–450 |
| 5. Event/storytelling generator (system + writing) | 250–500 |
| 6. Rival-sport AI | 100–200 |
| 7. Sponsor/TV/business layer | 100–200 |
| 8. Rules-evolution system | 60–150 |
| Balancing Phase 1 to be *fun*, not merely functional | 150–300 |
| **GDD Phase 1 subtotal** | **~1,350–2,750** |
| GDD Phase 2 (systems 9–16) | ~420–850 |
| Ship work (tutorial, Steam integration, store/trailer, achievements, QA, localization prep, art/audio management) | ~400–870 |
| **Total** | **~2,200–4,500** |

### 2.3 Calendar Conversion

| Pace | Phase 1 complete | Release |
|---|---|---|
| 10 hrs/week (~500 hrs/yr) | 2.7–5.5 years | 4.5–9 years |
| 20 hrs/week | 1.4–2.8 years | 2–4.5 years |
| Full-time (~1,800 hrs/yr) | ~0.75–1.5 years | 1.2–2.5 years |

Splitting time with other active titles adds context-switching cost beyond these ranges.

### 2.4 Known Time Sinks (set time limits when each phase starts)

The GDD defers black-hole analysis until after Phase 1. This plan names the obvious ones now:

1. **Event/story content.** The dry humor only works if it doesn't repeat, which likely means
   300–800 event templates at launch. This is the most underestimated line item.
2. **Player simulation depth.** The player operates the sport, not a team, so full rosters mostly
   feed stories. Build only the depth that stories actually use.
3. **Business layer.** Per-country cash, sponsors, and TV can expand indefinitely. Limit it to
   what drives the League Health Ladder.

### 2.5 Recommended Phase 1 Adjustments

- **Decided 2026-09-13:** Pull **lightweight press coverage, awards, and Hall of Fame** into Phase 1. They are how stories
  reach the player, so the story generator's value is hard to judge without them.
- Keep **rival AI** and **rules evolution** deliberately simple in Phase 1; deepen in Phase 2.
- National teams and the World Cup/Olympics equivalent stay in Phase 2.

### 2.6 Build Plan: Flagship Stars (GDD v1.16)

Phase 1 milestone: "an emerging star." Small on purpose: one leading player per club, a few
stars per league. Each step ends with `npm run check` passing; a step that changes balance names
the one experiment that measures it. Every number is config (`flagship.match`, a new
`flagship.stars` block).

1. **Scoring frequency in the match engine.** `flagship.match.chances` becomes a map by the
   genome's scoring option (e.g. low 3, medium 6, high 14) with a rate per option, tuned in a
   pure test so the stronger club wins about as often at every frequency. Applies from the next
   season start. Measure the season stories' rates per frequency once (a short flagship-only
   report, not a full experiment) and retune `flagship.stories` if close finish or runaway drift
   far. *Built 2026-10-03:* the season's rule is recorded (flagship and season summary), which
   took save format 10; the American close-finish margin became per frequency (high 2).
2. **Leading players.** A `Player` type in `FlagshipState`: id, name, birthplace (a real place,
   weighted as clubs are), club, birth season, hidden peak and current skill. Name pools per
   language sphere in `names.yaml`, validated at load. Generated at club founding (ages spread
   18–32) and on retirement (young, peak skill leaning toward the club's rating). All on the
   flagship RNG stream; a determinism test proves the world's random sequence is unchanged.
   *Built 2026-10-03:* 60 pools of 30 given and 30 family names (men's names; every sport is men's
   for now): the 54 language spheres plus six regional pools for markets whose sphere does not match
   how people are named (West African anglophone, southern African, francophone African, Pacific
   islands, Pakistani, Central Asian), mapped per country in `names.yaml`. Any active club without a
   leading player gets one when clubs are fitted, which covers founding, expansion and old saves.
   Save format 11 (players). Replacement on retirement moves to step 4 with retirement itself.
3. **Credited scores and career lines.** Each successful chance credits the leading player with
   a config probability raised by skill. Season tallies (matches, scores, playoff scores, final
   scores) become a permanent career line at season end; per-match scorers are never stored.
   Season summaries add the top scorer and any new star.
   *Built 2026-10-03:* each score goes to the leading player with chance clamp(0.25 + 0.006 × (skill
   − 50), 0.05, 0.6), otherwise the squad; deciders are not scores. Tallies live on the flagship
   during a season and become career lines at its end; an abandoned season (the seat returning home)
   is never written. Save format 12. Measured once (Brazil, 5 seeds × 40 seasons): the top scorer
   reaches 35% of the club's scores in 59% of low-scoring Amateur seasons, 38% at medium and 32% at
   high, so the star bar does not read the same at every frequency; step 4 decides whether to make
   it per frequency.
4. **Stars and careers.** At season end the top scorer with at least the config share of their
   club's scores becomes a star if a place is open (places by tier). A star's strength bonus,
   scaled by skill, adds to their club's match rating. Skill curve with a seasonal wobble,
   final-season announcement from 31, retirement by 37, replacement. A star may move up to a
   higher-rated club (the clubs swap leading players). Seat moves leave players at dormant
   clubs. Landmarks: the first star, star retirements, moves.
   *Built 2026-10-03:* the star bar is per scoring frequency (low 0.44, medium 0.39, high 0.37): a
   single 35% bar made stars in 13% of low-scoring Amateur seasons against 10% of high-scoring ones,
   with the first star in season 1–2. Measured once (flagship only, Brazil, 16 seeds × 40 seasons):
   stars in 9–10% of Amateur seasons at every frequency, the first star at median season 5 / 2 / 5,
   retirement at median age 33; stars lift runaway and foregone-league stories by a few points. Star
   strength is 0.08 × skill rating points; a star moves with chance 0.25. Landmarks: firstStar,
   starRetired, starMoved. Save format 13.
5. **Backing.** `backStar` and `dropStar` through `applyAction`: window only, slots by PP tier,
   price = base × the peak tier's multiplier, no upkeep. Influence ramps over a config number of
   seasons. Effects: casual conversion in the flagship country and the media reach channel out
   of it, scaled by influence, paused off the seat; the honors afterglow fades over a few
   seasons. Measure: `--experiment pacing` (win contest, 12 anchors × 5 seeds).
   *Built 2026-10-03:* slots in the PP tier table (1/1/2/2/3), price 60 × the peak tier's cost
   multiplier, influence +1/4 per season played at the seat; each backed star at full influence
   multiplies casual conversion in the flagship country by 1.15 and media reach out of it by 1.3.
   Only stars playing at the seat can be backed; a retirement ends the backing; a lost slot after a
   PP tier demotion keeps existing backing. Bots back the stars with the most career scores. The
   honors afterglow comes with the succession card in step 6. Measured with pacing (builder, 12
   anchors × 4 seeds, 200 turns; 5 seeds overran the 5-minute budget): bots backed 25 of 26 stars
   made, first at turn 31; first win median 155 → 161 and #1 lost before the win 15/44 → 13/43, both
   within noise: backing barely moves the world at these sizes. Save format 14.
6. **Star cards.** The breakout moment (always, no slot, PP by tier); final season, retirement,
   unbacked move and career-record moments (records checked against retained careers); the
   succession decision (honors, mentor the named candidate, let go), the keep-or-let-move
   decision (league cash) and the full-influence drop pressure card, counted against the decision
   cap, offered after season cards, with free defaults. Season cards name the champion's leading
   player and the top scorer where recorded. Bot weights for every new card; bots back stars.
   *Built 2026-10-03, kept subtle:* eight cards (breakout, final season, retirement, move and record
   moments; succession, keep-or-let-move and dropped decisions) in `src/sim/star-cards.ts`, built
   from a season's new star and four new landmarks (starFinalSeason, scoringRecord, starDropped, and
   starMoved's backed flag). Every free default has no effect: a backed star's move happens at
   season end and keeping them swaps the players back for 4 quarters of league running cost; a
   backing ends at retirement unless honored (fades over 3 seasons) or passed to the mentored
   successor (half the influence, +0.1 credit through the final season). The snapshot carries player
   names only. Runner (builder, 4 campaigns): bots mentor every time and always keep a moving star,
   since healthy leagues hold plenty of cash. Smoke opens a star card. Save format 15.
7. **Saves.** Built with each step: players (format 11), career lines and top scorers (12), stars
   and careers (13), backing (14), star cards (15).
8. **Screen.** A Stars panel on the flagship screen (recorded facts only, an influence bar,
   backing slots with a review step), the leading player and tally on each table row, backed
   stars named in the flagship country's tooltip. Skill and strength bonuses stay out of
   `TurnSnapshot`. Smoke screenshots the Stars panel; run the game and screenshot a breakout
   moment.
   *Built 2026-10-04:* the panel sits above the table; stars show club, age, birthplace, season and
   career tallies, star since and a final-season tag; backed stars an influence bar. Back and drop
   use a review step (price; lost influence, goodwill cost and the pressure card at full
   influence), and disabled buttons give the simulation's typed reason (window, slots, PP). The
   snapshot gained `stars`, `backing` and `leaders`; no key names skill, strength or rating (a
   test walks it). Smoke backs a star through the review and finds them in the map tooltip.

Parked: star injuries (GDD parking lot), foreign players and moves abroad, full squads, a
"farewell title" story.


### 2.7 Build Plan: The Contest for #1 (GDD v1.17)

Measured 2026-10-04 (pacing, builder, 12 anchors × 3 seeds): #1 lost before the win in 11/33.
Raising max intensity (7/30), youth lift (10/31) or position pressure (5/33) does not help: the
player's lead grows steadily once past parity. Every number is config.

1. **Reclaim.** A timed countermove (`rivalAI.countermoves.reclaim`): Entrenched, near-top
   progress at least a config minimum, rival home hardcore share meaningful, player hardcore
   there. While it runs, a share of the player's hardcore fans there (above the turnover floor)
   switch to the rival each quarter, deterministic (no extra rolls), scaled by countermove
   resistance. A pressure moment card from the countermove landmark.
2. **World championships.** `rivalAI.tournaments`: per rival a first year, a cycle, the quarter
   of the year it starts, how many quarters the surge lasts, and casual, hardcore and home-lift
   boosts applied everywhere. A `rivalTournament` landmark at the start; a moment card in the
   player's biggest market. Names in `names.yaml`.
3. **Measure:** `--experiment pacing` until about half of the campaigns that reach #1 lose it
   before the win, with pacing still inside tolerance.

*Built 2026-10-04.* First sizes overshot: championships at ×3 casual / ×5 hardcore / +10% home,
or reclaim at 2% from mid-ramp, stopped every campaign short of #1 or made it flip every turn (a
30-turn hold spans about seven of each rival's championships). Settled: championships ×1.18
casual, ×1.6 hardcore, +1.8% home for 4 quarters (about a 1% world Fandom Score lift, fading over
three years); reclaim 0.5% per quarter for 12 quarters, only at the top of the near-top ramp
(its effect on the contest is small; championships carry it). #1 lost before the win 36/68
(53%), seeds 1–6; first win median 159–164. Reclaimed fans stay casual about the player's sport
and come from the rival's casual fans first. Landmarks and saves: a new landmark kind and
countermove kind, no format change (older saves load as they were).


### 2.8 Build Plan: Sport Identity (GDD v1.18)

Every option list is content (`content/identity.yaml`, ids only; player-facing words in the locale
file); every limit is config.

1. **Identity in the simulation.** `GameState.identity`: sport name, founding club id, ground
   name, birthplace, ethos, terms (score, match, season) and emblem (shape, icon, two colors).
   `CampaignSetup.identity` is optional and validated; defaults are generated from the seed
   (sport name from content name parts). The founding club takes the chosen place and name
   after the flagship is created, so no random draw changes. In the snapshot. Save format 16;
   format 15 migrates with generated defaults and the anchor's first club as the founding club.
2. **Setup.** A third setup panel: name, re-roll, founding town, club and ground names,
   birthplace, ethos, terms, emblem with a live preview and the field diagram.
3. **Rulebook and field diagram.** The Rulebook section in "Your sport": emblem, names, founding
   facts, genome prose with odd-pairing lines, and an SVG field diagram from surface, footprint,
   team size, equipment and structure. The emblem in the map's campaign identity and the
   flagship heading; the founding club marked in the table.
4. **Terms in text.** The flagship screen, Stars panel and season and star cards use the chosen
   score, match and season nouns.
5. **Smoke and docs.** Smoke fills the identity panel, checks the rulebook and diagram in both
   layouts, and screenshots them.

*Built 2026-10-04.* Setup became two pages so each fits a 1280 × 800 window (the founding panel
pushed Start off-screen). Terms reach the flagship screen, Stars panel, season and star cards and
their effect text through one helper (`useTermVars`); the seasonal window keeps its name (it is
the game's calendar, not the sport's season). Renamed terms each get a full sentence in the
Rulebook. Save format 16. `tests/identity.test.ts`; smoke screenshots the founding page and the
Rulebook in both layouts.


### 2.9 Build Plan: Rules Evolution, First Build (GDD v1.20)

Every number is config (`rulesEvolution`).

1. **Amendments in the simulation.** `GameState.rules`: the amendments made (turn, quarter, year,
   axis, from, to, jump, hardcore fans who turned casual) and the year of the last one. The
   `amendRule` action through `applyAction` with typed blockers (window, already amended this
   year, identity trait, same option, PP); the genome changes at once; the flagship's season rule
   already follows the genome at each season's start. Landmark `ruleAmended`. Save format 17;
   format 16 migrates with no amendments.
2. **Backlash.** Per country: share = base × jump × min(1, rule age ÷ full age) × (anchor factor
   in the anchor) × (1 + fit weight × how much worse the new option fits there, if it does),
   capped; hardcore fans above the turnover floor turn casual. A preview in the snapshot: per rule
   option, the price, the hardcore fans who would turn casual, and fit hints for the anchor and
   the five biggest markets.
3. **Bots.** The builder amends when the change's fit gain across its fans' markets beats its
   backlash by a margin; other bots never amend. Measure once with `--experiment pacing`.
4. **Screen.** The Rulebook gains "Amend the rules": each rule trait with its option and how long
   it has stood; in the window, pick a trait and option, review, confirm. Outside the window or
   after this year's amendment the controls say why. Amendments listed with dates.
5. **Smoke and docs.** Smoke amends a rule in the window through the review step and checks the
   Rulebook lists it; tests cover price, jump, blockers, backlash, timing, save and migration.

*Built 2026-10-04.* Base price 100 PP; backlash 3% per jump at full age (40 years), anchor × 2, fit
weight 2, cap 25%. The builder amends a median 3–4 times per campaign, first around turn 45. Pacing
(builder, 12 anchors × 6 seeds): amendments dropped #1 lost before the win from 53% to 34% (the
leader pulls clear faster on a better-fitting rulebook), so world championships went one step
stronger (casual × 1.26, hardcore × 1.9, home + 2.6%), giving 34/68 (50%); first win median turn
167–170. The price is small against late-game PP; the backlash is the real cost. Save format 17.


### 2.10 Big and Rich Markets (GDD v1.21)

Built 2026-10-04 with the rules-evolution follow-up. The balance check after amendments found
differentiation 1 of 6 pairs: every sport amended toward the population giants' tastes (the
biggest markets by Fandom Score are the same for everyone late on). A drift backlash, a hard
one-step bound and stronger backlash did not stop it (3 of 6 at best, or no amendments at all).
Decided: accept convergence as natural, judge differentiation on sports as invented, keep the
founding-drift backlash (weight 1.5, return factor 0.5), and make big markets behave differently:
genome fit softens with population (`bigMarkets`), four wealth levels from the World Bank income
groups (`wealthLevels`) weigh Prestige income and rival market value (`rivalAI.marketValue`).
Measured: pacing passes (first win 163–169), #1 lost before the win 53% after scaling the world
championships back, differentiation 5 of 6 as invented. `tests/markets.test.ts`; docs in
`docs/markets/README.md`.

### 2.11 Build Plan: Culture, First Build (GDD v1.22)

Every number is config (`culture` in `content/config.yaml`); founding-character multipliers are in
`content/identity.yaml`, names in `content/names.yaml`. The sim lives in `src/sim/culture.ts`.

1. **State, content and save.** `GameState.culture`: traditions (stable id, type, name parts,
   home country, followers with their strength, strength, the rule traits at birth, origin facts,
   born and lost dates and reason), progress counters (derby meetings by club pair, fame facts by
   ground, trophies by league) and the next id. Every club gets a ground name from invented ground
   names (the founding club keeps the identity's ground), rolled on the culture's own random
   stream so the world's sequence never depends on it. Zod schemas for the config block, the
   birthplace and ethos multipliers (with the balance guard), name pools and rival flavor
   traditions. Save format 18; format 17 migrates with no traditions, no counters (no retroactive
   history) and ground names for existing clubs.
2. **Births, renewal, decay and loss.** Read facts where they are recorded: the season summary
   (derby, rite, venue, trophy), star retirement (star legacy), league promotion (national name),
   club and league folds (loss). Yearly decay without renewal. Landmarks `traditionBorn` and
   `traditionLost`. Tests for every birth rule and the founding-character multipliers.
3. **Effects.** Tradition weight per country; the factor on the player's generational turnover
   (`quarter.ts`) and on poaching and reclaim (`poaching.ts`, `rivals.ts`); the venue's
   pilgrimage pull and the champion moment's PP multiplier. Invariants: strengths in 0–1, weight
   capped.
4. **Betrayal.** Offended traditions in the amendment backlash and its preview (`rules.ts`), the
   seat move's cost and preview, trophy naming (`nameTrophy`: on the first champion card, free)
   and renaming (`renameTrophy`: window only, ends the old trophy) through `applyAction`.
5. **Cards.** A birth moment per tradition (PP by type) and a loss moment, built only from the
   facts recorded on the tradition.
6. **The Culture growth category.** The four effects in the closed vocabulary with the optional
   `traditionType`, reach's yearly roll on the culture stream, the 8 nodes and the fork; bot
   weights.
7. **Snapshot and screens.** Traditions in the `TurnSnapshot`; the map marker and country card
   list; the Rulebook's Traditions section; flagship tags and the trophy name; the trophy-naming
   input; offended traditions in the three reviews. i18n for every string.
8. **Smoke, measure and docs.** The smoke test plays until a tradition is born and screenshots it
   in both layouts. Pacing on seeds 1–3 and 4–6 (must pass; #1 lost before the win about half)
   and differentiation as invented. `docs/culture/README.md`, `docs/progress/data.js`, CLAUDE.md.

*Built 2026-10-04.* Culture runs once per turn after the league evaluation (`updateCulture` in
`src/sim/turn.ts`), reading landmarks and season summaries since its cursor; reach rolls on its
own stream. Event records gained tradition facts (format 18 sets them null on older records).
The flagship isolation tests switch tradition effects off with the season cards
(`tests/helpers.ts` `cardless`). Measured with the builder over 12 typical anchors, 200 turns:
pacing passes on seeds 1–3 and 4–6 (the latter run as 4–5 and 6 to fit the budget); #1 lost
before the win 36/70 (51%); differentiation 5 of 6 as invented, unchanged. A campaign takes about
14% longer. The builder never buys Culture nodes (its value-per-PP rule prefers grassroots, as
with Media); the options experiment (340 campaigns, about 20 minutes) was not run.

### 2.12 Build Plan: The Flagship's Broadcast (GDD v1.23)

Every number is config (`flagship.broadcast` in `content/config.yaml`). The sim lives in
`src/sim/flagship.ts` beside `backingEffects`; spread reads it in `src/sim/spread.ts`.

1. **Config and interest.** Schema for tier ceilings, interest by season kind, health factors,
   pulse size, story multiplier and fade, ripple share. A pure `seasonInterest` reads the last
   finished season summary with the story thresholds in `flagship.stories` (no new saved state
   if the summary carries enough; otherwise a save format step). Tests on both formats.
2. **Broadcast and pulse.** `broadcastEffects` returns the seat country and its media reach
   multiplier (ceiling × interest × health, plus the fading pulse since the season ended);
   `computeExposure` multiplies it with backing on the seat country's outbound media links.
   Invariant: multiplier ≥ 1, 1 when no league holds the seat.
3. **Ripple.** At Near-Collapse, a casual drain each quarter in countries with a media link from
   the seat, scaled by link strength relative to the strongest, never the seat country itself
   (`quarter.ts`). Tests: drain only at Near-Collapse, hardcore untouched.
4. **Snapshot and screens.** The broadcast's share in the country tooltip and the interest word
   with health on the flagship screen; i18n for every string. Screenshot both layouts.
5. **Measure and docs.** The runner reports the flagship's share of world media reach exposure
   against the target; pacing on seeds 1–3 (must pass; #1 lost before the win about half).
   `docs/flagship/README.md`, `docs/progress/data.js`, CLAUDE.md.

*Built 2026-10-05.* `seasonInterest`, `broadcastEffects` and `mediaReachFrom` in
`src/sim/flagship.ts`; `computeExposure` applies the lift and reports it as
`CountryExposure.broadcast`; the ripple is extra casual churn in `quarter.ts`. No save format
step: interest and the pulse are read from the season summaries. Step 2 changed after measuring
(GDD v1.27): multiplying the seat's own outbound media gave 0–5% of world media exposure, about
0.1% by tiers 4–5, so the broadcast now lifts all media reach into the markets the seat's media
reaches, by link ÷ the strongest. Ceilings retuned to Amateur 0.05, Semi-Pro 0.07, Professional
0.1, Elite 0.16. The tooltip shows the lift ("media reach here +N%"), not a share of exposure,
which was too small to read. The runner averages the share over each turn's quarters (the pulse
fades within a turn) and judges the target only where the seat is in a large media market.
Measured with the builder over 12 typical anchors, seeds 1–3 (run as 1–2 and 3 to fit the
budget), 200 turns: 9–12% for Sweden, Kazakhstan and Australia (target 5–15%); the other nine
anchors are small media markets and never broadcast. Pacing passes pooled (tier 2 at turn 31,
tier 5 at 121.5, first win at 159; seed 3 alone misses tiers 2 and 4, exactly as without the
broadcast); #1 lost before the win 20/36 (56%).

### 2.13 Build Plan: Living Time and the Offseason (GDD v1.24, revised v1.25)

Mostly renderer work. Revised 2026-10-05 (v1.25): the clock (step 3) was built, played and
removed; turns stay Next Turn, and cards pop up after each turn.

1. **Offseason timing (sim).** Rename the seasonal window to the offseason in code, config, the
   snapshot and the locale. The offseason opens on the first turn that starts after a season
   ends; its actions apply when it closes, before the next season's first matches (the seat move
   included). Tests on quarter, half-year and year turns. Save: derived from the season record if
   possible, otherwise a format step. Pacing on seeds 1–3 and the win contest remeasured once.
2. **Quarter facts on cards (sim).** Every offered card carries the quarter its fact happened, so
   the renderer can reveal it there. No change to what is offered or when it resolves.
3. **The clock (removed).** Built and reverted the same day (v1.25). Kept from it: the date as the
   bottom bar's headline.
4. **Event windows.** After Next Turn, the turn's decisions one at a time over the map in the
   order their facts happened (the card's quarter), country highlighted, choice buttons with
   one-line effects and hover detail, a confirm only for PP costs; moments as map pickups and
   toasts; the board becomes the journal.
5. **The offseason screen.** Season review, then stars, rules, promotions, the seat and the trophy
   in one place with prices against PP on hand; the amend, backing and seat controls move here
   from their tabs (tabs keep read-only views).
6. **Smoke and docs.** The smoke plays to the first offseason, backs or prices a star there and
   answers a pop-up decision; screenshots in both layouts.
   `docs/progress/data.js`, CLAUDE.md.

*Step 1 built 2026-10-05.* `FlagshipState.offseason` (save format 19), read through
`offseasonOpen`; `closeOffseason` runs at the start of `endTurn`, and a bare `stepQuarter` closes
it first (as at a quarter-length turn's start) while `endTurn` holds one opened mid-turn. Config
`offseason.seasonEndQuarter` replaces `seasonalWindow.quarterOfYear`. Measured with the builder
over 12 typical anchors × seeds 1–3, 200 turns: pacing passes (tier 5 median turn 122, first win
160); #1 lost before the win 17/36 (47%, was 51%); stars first backed at turn median 40.

*Step 2 built 2026-10-05.* An event record's `quarter` is now when its fact happened: the
landmark's quarter for season, star, tradition, rival and league cards, the turn's end for audience
and league-pressure cards (judged then). The field already existed, so the save format is
unchanged; records from before keep the turn's end. The snapshot passes it through. With the
clock gone, the pop-ups use it to order a turn's cards and to date them.

*Step 4 built 2026-10-05.* `EventLayer` (renderer) shows the next unanswered decision as a window
over the world view, oldest fact first, dated by its quarter; choices are buttons with their first
effect line and the full list on hover or focus, a confirm only when a choice costs PP, and
"Decide later" sets a card aside for the turn. The card's country is outlined in its own colour
(the selection is untouched: selecting it switched the country card away from the player's own
choice) and the window docks on the half of the map away from it. Once no decision waits, moments
show as toasts (three at most) that collect on click. The board's card words moved to a shared
`event-text.tsx`. The map smoke sets pending cards aside before its physical clicks.

*Step 5 built 2026-10-05.* `OffseasonScreen` (renderer, full page like the flagship) reuses
`StarsPanel`, `AmendRules`, `Seat` and `TrophyCard`, which gained `readOnly` for the tabs, and adds
a promotions list (qualifying leagues, biggest followings first, five shown). It opens itself only
from the world map; while the offseason is open a nav tab leads to it. Narrow layout: the nav
scrolls instead of wrapping (the top bar and the page column may shrink). The stars and rules smoke
steps now act on the offseason screen and check that the tabs are read-only (before, the rules
step passed by clicking the hidden screen's controls while screenshotting the Rulebook).

*Step 6 built 2026-10-05.* `src/main/popup-smoke.ts` plays on the world map to a decision and
checks the window names its country, the map outlines it (`data-highlighted`) without moving the
selection, a choice's full effects show on hover, a paid choice asks first and cancelling spends
nothing, a free choice answers at once, Decide later answers nothing, the outline clears, and a
moment toast collects; then it plays to the next offseason from the world map and checks its
screen opens on the season's champion. Screenshots and overflow checks in both layouts. Build plan
2.13 is complete.

### 2.14 Build Plan: Moments Have Weight (GDD v1.26)

1. **Content and snapshot.** `weight: minor | big | headline` on every moment card in
   `content/events.yaml` (Zod, required for moments); config `events.weight.flagshipHeadlineTiers`
   (a big flagship card is a headline at these league tiers) and the first-ever star as a
   headline. `EventSnapshot` carries the resolved `weight` and a `family` (season, star,
   tradition, rival, sport) read from the card's facts.
2. **Windows.** `EventLayer` shows big and headline moments first, oldest fact first, then
   decisions, then minor toasts. Big: a back-page window with a Collect button and a pulsing ring
   on the country. Headline: a front page over a dimmed map with the emblem and colours, and a
   burst on collect. Each family has its own masthead and accent. No dismiss.
3. **Next Turn waits.** Next Turn is disabled, with the reason, while a big or headline moment is
   uncollected. Smoke steps collect them through one shared helper before ending a turn.
4. **Smoke and docs.** The pop-up smoke collects a big moment and screenshots a headline in both
   layouts. `docs/progress/data.js`, CLAUDE.md.

*Built 2026-10-05.* Weights as content: minor for first following, league formed or promoted,
reclaim, a star's final season and a star's move; big for the champion, a star's breakout,
retirement and record, a tradition born or lost, and a rival's world championship. There are no
tier-up or #1 cards yet, so those wait for their cards. The map pulses the card's country and a
collected headline bursts from it. Next Turn reads "Read the news" while big news waits, and away
from the map it leads back there; the offseason screen opens once the season's news is collected.
Smoke steps collect news through `COLLECT_NEWS`.

---

### 2.15 Build Plan: Flagship Deals (GDD v1.28)

Every number is config (`flagship.deals` in `content/config.yaml`); partner name pools are in
`content/names.yaml`. The sim lives in a new `src/sim/deals.ts`; offers roll on the flagship's own
random stream.

1. **Content and config.** Schema for the baseline media share, slots by league tier, offers per
   open slot, lengths, the valuation (TV: casual fans × media market; sponsor: all fans × wealth;
   PP-tier cap), demand premiums and chances, the rule-demand limits (at most one per offseason,
   none while one is due, every slot always offering one without), rule-demand lists by partner
   kind, breach penalty and shun seasons, loyalty edges (larger for the gear brand), the TV fork's
   and countermoves' effects on offers. Partner name pools by kind. Validation: rule-demand steps
   exist on the genome axes; every pool is large enough.
2. **State, offers and signing.** `FlagshipState.deals`: signed deals, offers on the table, shunned
   partners. Offers are made when the offseason opens (renewals beside fresh offers, naming rights
   only for the founding or a famous ground) and lapse when it closes. A `signDeal` action
   (offseason only, through `applyAction`); `dealBlocker` gives typed reasons. Save format 20 with
   the format 19 migration (no deals; the baseline cut from the next offseason). Tests: offers on
   both formats, the rule-demand limits over many offseasons, determinism, save round-trip.
3. **Revenue.** The flagship's media line becomes baseline share × today's formula + signed deals'
   annual values ÷ 4 a quarter; other leagues are unchanged. TV exclusivity cuts the broadcast's
   lift while it runs. Tests: the no-deal flagship earns the baseline share; a full slate lands in
   the target band at each tier on fixed fan counts.
4. **Demands and breaches.** Checked where they can break: a tier change, a seat move or a seat
   sent home, the offseason closing past a rule demand's due season. A breach ends the deal, loses
   its remaining value, charges the cash penalty and shuns the partner. Naming rights on a famous
   ground wears its tradition down, demotes hardcore fans in the seat country (tradition weight ×
   ethos) and cuts its pilgrimage while it stands; on the founding ground it offends the club
   rite (`culture.ts`). Tests for each demand kind, forced breaches included.
5. **Events.** The breach moment (big), the deal-ended toast, renewal marking and the due-rule flag
   in the snapshot; card words in the locale.
6. **Bots and runner.** Bots sign the highest-value offer per slot. The runner reports deals
   signed, demands met, breaches by kind, deal share of flagship revenue, the slate-value ratio by
   tier against the target, and the flagship's Near-Collapse rate.
7. **Screens.** The Deals section on the offseason screen (slots, offer cards, confirm for demands
   and betrayals), a read-only Deals card on the Flagship tab, "due by season N" in the Rulebook;
   i18n for every string. The smoke signs a deal on the offseason screen; screenshots in both
   layouts.
8. **Measure and docs.** Pacing on seeds 1–3 (must pass), the #1 contest (about half), the
   Near-Collapse rate against the build before deals. `docs/deals/README.md`,
   `docs/progress/data.js`, CLAUDE.md.

*Step 1 built 2026-10-05.* `flagship.deals` in config with its schema (`dealsSchema`,
`DealSlot`, `DealDemand` in `src/content/schemas.ts`) and `balanceTargets.dealSlateShare`;
`names.dealPartners` (10 invented broadcasters, 20 sponsors by sector). `checkDeals` in
`src/content/load.ts` validates rule wishes against the genome's rule traits, the TV fork's node
ids, one cap per PP tier, a share per sponsor slot, and distinct partners numerous enough for an
offseason. The schema requires at least two offers per slot, so a slot always keeps an offer
without a rule demand (step 2 puts the one rule demand only where another offer stands). Values
are starting points; step 3 tunes them to the slate target.

*Step 2 built 2026-10-05.* `src/sim/deals.ts`: `newDeals`, `dealSlots`, `ordinaryDealValue`,
`dealCap`, `offerDeals`, `signDeal`/`signBlocker`, `lapseOffers` and `dealProblems` (invariants).
Deals roll on their own stream (`DealsState.rng`), so neither the world's sequence nor the
flagship's matches move. Offers are made once an offseason at the end of `endTurn`, after
culture (a ground made famous that turn gets its naming-rights slot), and lapse in
`closeOffseason`. A deal signed in the offseason pays from the coming season
(`flagship.season` is already the next season then). The partner whose deal just ended offers a
demand-free renewal (not through a sponsor lockout); the gear brand always offers for the main
sponsor. `offeredSeason` marks the offseason that made offers; the media baseline cut (step 3)
applies once it is set. Save format 20; format 19 migrates with none and no offers made.
`tests/deals.test.ts` covers slots, counts, the gear brand, the cap, stream independence, once
an offseason, lapsing, signing, renewal, the rule-demand limits over 60 draws, countermoves, the
TV fork and saves.

*Step 3 built 2026-10-06.* `leagueIncomePerQuarter` (`src/sim/deals.ts`) is every league's
income, used by the quarter step, the snapshot and the builder's promotion check: at the seat the
media line keeps `baselineShare` once offers have been made (all of it before), and paying deals
add a quarter of their annual value; a rival's sponsor lockout cuts the media line, never a signed
deal. A paying exclusive TV deal cuts the broadcast's lift by `exclusivityLiftCut`. Tuned with
`dealSlateShare` over builder campaigns at five anchors (seed 1, 150 turns, every offseason):
medians before the PP-tier cap Amateur 1.05, Semi-Pro 1.03, Professional 1.06, Elite 1.19 (target
1–1.2). The cap is judged separately: it trims a rich Semi-Pro flagship's windfall at PP tier 2
(0.76 after it) and never bound at Elite. Value rates: TV 0.575 of the media line per casual fan,
sponsors and naming rights much smaller; naming rights was first 40× too rich (late campaigns have
many famous grounds and many hardcore fans). Bots do not sign yet (step 6): with 40% of its media
line a builder's flagship still never collapsed (albania, sweden, 3 seeds, 150 turns, against the
build before).

*Step 4 built 2026-10-06.* `breakDeals` (`src/sim/deals.ts`) ends every signed deal whose demand
is broken: a tier floor when the seat league falls below it or folds, a seat lock when the seat
leaves the country, a rule demand when the offseason of its due season closes with the rule
unamended; exclusivity never breaks. It runs after every action (`applyAction`), when the
offseason closes (a seat move, rule deadlines) and after the turn's league evaluation (a fold, a
seat sent home). A breach charges `penaltySeasons` × the annual value to the league that signed
it (the seat's if that one is gone; nothing if neither has a league), shuns the partner for
`shunSeasons` and records a `dealBroken` landmark (step 5's news reads it; added to save format
20). Naming rights betray in `src/sim/culture.ts`: `betrayGround` wears a famous ground's venue
tradition (and the club rite on the founding ground) by `traditionWear` through the Culture
nodes' protection, and demotes seat-country hardcore fans by `hardcoreDemotionShare` × their held
strength × the ethos's rename factor; `venueStrengths` cuts a named ground's pilgrimage while the
deal pays. Tests: each demand kind with forced breaches, the rule deadline met and missed, the
penalty, shunning, both betrayals, and the landmark's save round-trip.

*Step 5 built 2026-10-06.* A `deal` trigger with two moments in `content/events.yaml`:
`deal-broken` (big, pressure) and `deal-ended` (minor), told by `src/sim/deal-cards.ts` from the
`dealBroken` and the new `dealEnded` landmark (recorded when `offerDeals` ends a deal at its
term). Event records carry `facts.deal` (partner, slot, broken demand, penalty); format 20's
migration sets it null on older records. Deal cards take no moment slot (`takesNoSlot`) and form
a new card family, "business" (The Business Pages, its own accent). Card words in the locale, by
the broken demand and whether a penalty was paid; the gear brand is named from the sport
("{sport} Supply Co."). `dealsSnapshot` (on `TurnSnapshot.flagship.deals`) gives the screens the
signed deals (paying, rule demand open, due this offseason), offers with renewals marked, the
seat's slots, shunned partners, the media share kept and deal income. Tests: breach news next
turn, term-end toast and renewal, the due flag at the deadline offseason, and the migration.

*Step 6 built 2026-10-06.* Every strategy bot (greedy-spread, builder, anchor-turtle, media-rush)
signs the highest-value offer in each slot in the offseason (`signDeals` in
`src/runner/policy.ts`), demands included, and plays on as usual; the random bot does not sign.
Each campaign records deals signed by slot and demand, breaches by demand, deal income's share of
the flagship's income, the slate share before and after the cap at every offseason (by league
tier) and the share of turns at Near-Collapse; `dealsAggregate` prints them and judges the slate
by tier against `balanceTargets.dealSlateShare`; campaigns.csv gains four columns. First read
(builder, sweden, 3 seeds, 200 turns): about 300 deals signed a campaign, mostly short naming and
sponsor terms; 11 of 20 rule demands broken (the builder amends by its own fit, not its deals);
deal income 19% of the flagship's income; no Near-Collapse; slate before the cap 105% at Amateur,
Semi-Pro and Professional, 117% at Elite (Semi-Pro 93% after the cap).

*Step 7 built 2026-10-06.* `src/renderer/src/deals/`: `DealsPanel` on the offseason screen (each
slot with its signed deal or this offseason's offer cards: partner, value, length, the demand in
plain words, Renewal and Homegrown tags, the betrayal warning on a famous ground or the founding
rite; signing asks first only for a demand or a betrayal, and the review states a breach's cost
for demands that can break), read-only on the Flagship tab; `useDealPartnerName` shared with the
event cards. Warnings where actions break deals: the seat review (seat locks) and the step-down
confirmation (tier floors); the Rulebook lists open rule demands with their due season. Two sim
fixes found in the running game: the PP-tier cap now bounds an offer's ordinary value before its
spread, gear-brand share and premium (a capped Amateur flagship had shown every offer, the gear
brand included, at the same value), and a rule demand comes only on a deal of at least
`dueOffseasons + 1` seasons (a one-season deal paid the premium for a demand that could never
break). The smoke (`src/main/deals-smoke.ts`) signs an offer on the offseason screen through the
review, checks the slot, both layouts and the read-only tab: `runs/smoke/41-deals.png` to
`44-deals-narrow.png`.

*Step 8 measured 2026-10-06.* Builder, 12 typical anchors, seeds 1–3 (run as 1–2 and 3 to fit
the budget), 200 turns: pacing passes pooled (tier 2 at turn 33, tier 3 43.5, tier 4 76.5, tier 5
120.5, first win 159; seed 3 alone misses tiers 2 and 4 as it did before deals); #1 lost before
the win 21/36 (58%); deal income 14% of the flagship's income; the flagship never reached
Near-Collapse. The slate read 1.20–1.21 at Elite on these anchors, so the second and third
sponsor shares were cut to 0.25 and 0.1: Elite 1.18–1.19, Professional 1.05–1.08, Semi-Pro
1.03–1.04, Amateur 1.05, all inside 1–1.2. Against the build before deals (b3b91b6, same script,
greedy-spread, 12 anchors, seed 1): the flagship spent 13.3% of turns Struggling (1.8% before),
0.2% at Near-Collapse (none) and one anchor collapsed (Sweden; none before): harder for careless
play, never unsinkable. Bots broke 362 of the 374 rule demands they signed (they take the premium
and amend by their own fit); reported, not judged. Docs: `docs/deals/README.md`.

### 2.16 Build Plan: Deal Clauses (GDD v1.29)

Every number is config (`flagship.deals.clauses`). Builds on 2.15's demand machinery.

1. **Config, kinds and save.** Three clause kinds beside the demands (`balance` on TV offers,
   `star` on sponsor offers, `fans` on any offer), each with a chance and a premium; the bonus
   share and renewal-edge growth when met; misses in a row before a partner walks. One demand or
   clause per offer; a slot keeps a clause-free offer. Rule demands' chance halved. A deal records
   its clause's seasons met and misses in a row, and the fans it is judged against. Save format
   21 (format 20 deals migrate with no record yet).
2. **Judging.** At each season's end a paying deal's clause is judged: balance by the season's
   interest (not runaway), star by a star playing at the seat, fans by the seat country's fans
   against the last judgement (signing for the first). Met: the bonus share of the annual value
   to the league and a larger renewal edge; missed: a miss; two in a row: the partner walks (the
   deal ends, no penalty, no shunning, a `dealWalked` landmark). Tests: each kind met and missed,
   the bonus, the walk, the renewal edge, determinism.
3. **News and screens.** A walk is a big business moment; a first miss is flagged on the Deals
   panel ("one more miss and they walk"); offer cards and signed deals state their clause; the
   renewal offer shows its grown edge. i18n for every string; smoke screenshots.
4. **Bots, runner and measure.** Bots sign as before. The runner reports clauses signed, met,
   missed and walks by kind. Pacing on seeds 1–3, the #1 contest, the slate (clauses are not in
   the ordinary slate). Docs: `docs/deals/README.md`, progress, CLAUDE.md.

*Step 1 built 2026-10-06.* The clauses are demand kinds (`balance`, `star`, `fans` in
`dealDemandSchema`), so they share the one-per-offer draw (config order, cumulative chances:
balance on TV offers, star on sponsor offers, fans on any) and the premium machinery, and never
break (`breakDeals`). `flagship.deals.clauses` holds the judging rules (bonus 10% of the annual
value, renewal edge +3% per season met, a walk after 2 misses in a row); demand chances were
trimmed (tier floor and seat lock 0.12, exclusivity 0.2) and the rule-demand chance halved to 0.1.
Every slot now keeps an offer with no demand or clause: if all draw one, the last fresh offer is
made plain at its plain value. A signed deal records `clauseMet`, `clauseMisses` and `fansMark`
(the seat country's fans at signing). Save format 21. The Deals panel states each clause and, in
the review, how it is judged (bonus, the walk) instead of a breach's cost. Tests: draws by slot
kind with a plain offer kept, clauses never breaking, the format 20 migration.

*Step 2 built 2026-10-06.* `judgeClauses` (`src/sim/deal-clauses.ts`, kept out of deals.ts to
avoid an import cycle with flagship.ts) runs once an offseason in `endTurn`, just before
`offerDeals`, so a deal in its final season is judged before it ends. For every deal with a
clause that paid in the season just finished: balance is met unless that season's interest was
runaway (foregone included); star while a star plays at the seat; fans while the seat country's
fans are at least the deal's mark (then the mark moves to now). Met: `bonusShare` of the annual
value to the seat's league, one more season met, misses cleared. Missed: one more miss; at
`walkAfterMisses` the partner walks (deal removed, no penalty, no shunning, a `dealWalked`
landmark, in save format 21). A renewal's edge grows by `renewalEdgePerMet` for every season met.
Tests: met with its bonus, missed twice to the walk, balance after a runaway or a calm season,
star with and without a star at the seat, the grown renewal edge.

*Step 3 built 2026-10-06.* A `deal-walked` moment (big, the business family, worded by the
clause: balance, star or fans), told from the `dealWalked` landmark by `src/sim/deal-cards.ts`;
the deck is 31 cards. The Deals panel shows a signed clause's record (seasons met) and, after a
miss, "one more miss and they walk"; the review states how a clause is judged (bonus, the walk);
the Renewal tag explains the loyalty price. The renewal's grown edge is in its value, not shown as
a number: the offer does not carry the old deal's record. Found in play: one-season clause deals
paid the premium for almost no risk, so clauses now come only on deals of at least
`walkAfterMisses + 1` seasons (an offer's length is drawn before its demand; GDD updated). The
smoke prefers a breakable demand, then a clause (its review must say how it is judged). The
clause record and warning are not reached by the smoke campaign; their snapshot fields are tested.

*Step 4 built 2026-10-06.* The runner counts clause judgements by kind (seasons met, missed,
partners who walked): changes on deals still running, the final judgement of a deal that ended at
its term (re-judged with the exported `clauseMet` on the post-turn state, which judging saw), and
walks from their landmarks; every run prints them. Measured with the builder over 12 typical
anchors, seeds 1–3 (run as 1–2 and 3), 200 turns: pacing passes pooled (tier 2 at turn 33, tier 3
43.5, tier 4 76.5, tier 5 120, first win 158); #1 lost before the win 20/36 (56%); slate in the
band at every tier (Amateur 105%, Semi-Pro 103–105%, Professional 105–107%, Elite 118%); no
Near-Collapse. Balance met 89% of seasons judged (9 of 192 partners walked), star 75% (137 of
416), fans 60% (336 of 866). Rule demands at half the chance: 186 signed, 181 broken.

*Fans tolerance 2026-10-06.* The fans clause was a coin flip because season-to-season fan counts
wobble; it is now met while fans stay within `clauses.fansTolerance` below the mark. Measured on
seeds 1–2: 2% made it 99% met (free money); 0.5% gives fans 81%, star 80%, balance 86%; pacing
passes. GDD and cheat sheet updated.

## 3. Design Prerequisites (GDD Gaps That Block the Build)

These come from the GDD review. Items 1–4 must be specified before Phase 0 implementation begins.

| # | Gap | Why it blocks | Suggested direction |
|---|---|---|---|
| 1 | ~~**Genome mechanics**~~ | **Resolved 2026-09-12** — see GDD Sport Genome | ~10 discrete trait axes; accessibility traits drive casual conversion, depth traits drive hardcore; rival similarity eases casual, hinders hardcore; identity vs. rule traits |
| 2 | ~~**PP income source**~~ | **Resolved 2026-09-12** — see GDD PP Income | Base income from Fandom Score (diminishing returns) + moment bonuses as clickable map pickups; tier-scaled costs; quarterly sim step; turn length set by PP tier |
| 3 | ~~**Spread model**~~ | **Resolved 2026-09-12** — see GDD Spread Model | Only casual exposure crosses borders; proximity/language/media channels; focus slots; cold launches cost more; country-level granularity |
| 4 | ~~**Story → mechanics link**~~ | **Resolved 2026-09-12** — see GDD Event System | Moments + decision cards from recorded facts; closed effect vocabulary; decisions capped per turn; pickups auto-collect; negative events scale with tier |
| 5 | ~~**Fandom share definition**~~ | **Resolved 2026-09-12** — see GDD Fan Model | Three buckets (uninterested / casual / hardcore); hardcore exclusive and sticky; Fandom Score = hardcore + weighted casual |
| 6 | ~~**Rules-evolution trade-offs**~~ | **Resolved 2026-09-12** — see GDD Rules Evolution | PP cost, seasonal window, 1/year; backlash scales with hardcore base and rule age; global rules; proposals from player, broadcasters, sponsors, league directors (renamed from commissioners in GDD v1.11) |
| 7 | ~~**Turn anatomy**~~ | **Resolved 2026-09-12** — see GDD Turn anatomy | 5-step turn; per-tier targets for markets, slots, pickups, cards, real time; anchor starts with founding amateur league; league attention via map signals + seasonal windows + crisis cards (no inbox) |
| 8 | ~~**Campaign length & replay**~~ | **Resolved 2026-09-12** — see GDD Campaign length | ~10–15 hr to first win; anchor country + genome as replay levers; anchor difficulty rating + Easy/Normal/Hard; multiple save slots, no ironman |
| 9 | ~~**Late-game pressure**~~ | **Resolved 2026-09-12** — see GDD Late-Game Pressure | Anchor resentment; generational hardcore turnover; rising running costs by league tier; rivals defend hardest near #1 |
| 9b | ~~**Rival AI**~~ | **Resolved 2026-09-12** — see GDD Rival AI | Real-world sports as rivals (present-day start; 7 sports + combat sports bucket + passive "other"); defense budgets; per-country escalation ladder; closed countermove list; rival-vs-rival later |
| 10 | ~~**Delegation**~~ | **Resolved 2026-09-12** — see GDD Delegation | Standing policies with per-country overrides; window business surfaces only in focus countries; trait-driven commissioners in Phase 1 (renamed league directors in GDD v1.11; the player is commissioner of the flagship); player can always intervene |
| 11 | ~~**Showing the sport**~~ | **Resolved 2026-09-12** — see GDD Showing the sport | Rulebook page with dated amendments (Phase 0); field diagram (Phase 1); player-made logo/ball/kit + 9x16 image export (Phase 2) |
| 12 | ~~**Real vs. fictional world**~~ | **Resolved 2026-09-12** — see GDD Rival AI and Map and markets | Real sport names; generic/fictional leagues, governing bodies, tournaments, teams, players; all real-world-facing names in one moddable data file. Markets follow sports-body conventions; Natural Earth de facto boundaries with neutral hatching for contested areas. Get a legal check before the Steam page |
| 13 | **Standard production gaps** | Needed before Early Access | Onboarding/tutorial, UI information architecture, difficulty, audio, accessibility, localization, price/DLC, target audience, competitor analysis, playtest plan with success metrics |

As of 2026-09-13, items 1–12 are resolved in the GDD, along with all original parking-lot items.
Item 13 is resolved except commercial decisions (deferred by choice), competitor analysis
(research), and music (postponed). The win-hold measure was confirmed in balance runs on
2026-09-18: 36 turns at tier 5 (GDD v1.7), retuned to 30 on 2026-09-19 when the hold became a
contest (GDD v1.8).

---

## 4. Stack Decision & Rationale

### 4.1 Chosen: TypeScript + Electron

Ranked reasons, weighed for an AI-steered solo project:

1. **The AI can verify its own work.** During development the game runs as a normal web page. The
   AI can open it in a browser, click through screens, take screenshots, and read the console —
   often fixing bugs before the developer sees them.
2. **One language removes logic↔UI bridge bugs.** Simulation and UI share one type definition for
   every data structure. A renamed field fails the build instead of showing `undefined` in a panel.
   Critical for a game this data-dense.
3. **Mistakes are caught before playtesting.** TypeScript's checker rejects many AI errors before
   the game runs.
4. **Hot reload.** UI changes appear in about a second, without restarting or losing game state.
5. **Balance batch speed.** Loop-heavy simulation runs many times faster than Python, so batches of
   hundreds or thousands of campaigns stay practical.
6. **Steam Deck / Linux works.** Electron bundles its own Chromium, so it runs under Proton and
   natively.
7. **Free browser demo** from the same codebase — a marketing lever for a hook-driven game.
8. **Packaging rarely triggers antivirus.**
9. **Familiarity carries over.** Existing PixiJS/HTML/CSS experience applies directly.

**Accepted costs:** Larger download (~150–250 MB; irrelevant on Steam), scheduled Electron
upgrades (Section 8), Steam overlay configuration quirks, npm dependency noise.

### 4.2 Rejected Alternatives

| Option | Why not |
|---|---|
| **Python + pywebview** (previously used stack) | AI can't easily see or click the running UI (it depends on the Python bridge). Logic↔UI mismatches go undetected. Errors surface during play. Balance batches much slower. **WebView2 does not work under Proton**, so Steam Deck breaks by default. PyInstaller builds are commonly flagged by antivirus (Nuitka is better, not immune). Steamworks bindings have a smaller community. No browser demo path. Microsoft auto-updates WebView2 on players' machines, outside developer control |
| **Godot 4 + C#** | Editor-centric work (asset import, scenes, export setup) that AI can't fully do through text. Frequent Godot 3 vs. 4 API confusion from AI. Developer must describe visual problems to the AI. C# projects can't export to web in Godot 4 (at time of evaluation). Viable runner-up if console/mobile ports become firm goals |
| **Godot 4 + GDScript** | Godot's editor friction plus weaker AI fluency and runtime-only errors |
| **Unity** | Most editor-bound; hardest to steer purely through AI; heavy; licensing-trust concerns. Only justified for firm mobile/console plans |
| **Unreal** | Overkill for a 2D, UI-heavy sim |
| **Bevy / Rust** | UI tooling too immature for a UI-dominant game |
| **GameMaker** | Weak for data-heavy UI |
| **Tauri** | Uses the OS webview; WebKitGTK on Linux/Steam Deck is inconsistent. Electron's bundled Chromium is predictable |

**What Python still does best:** balance-data analysis (pandas, notebooks). It stays in the
toolkit for analysis scripts, not the shipped game (Section 9.3).

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron main process                                          │
│   - window management, file I/O for saves                       │
│   - Steam adapter (the ONLY file that touches steamworks.js)    │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  Renderer (UI)                                                  │
│   React screens + Tailwind  ·  PixiJS map  ·  GSAP moments      │
│   Zustand store (what the screen currently shows)               │
└───────────────┬─────────────────────────────────────────────────┘
                │ Comlink (worker calls look like normal functions)
┌───────────────▼─────────────────────────────────────────────────┐
│  Web Worker: SIMULATION CORE (pure TypeScript)                  │
│   - deterministic; seeded RNG; plain data in → plain data out   │
│   - no UI, no DOM, no Electron, no Steam imports                │
└───────────────┬─────────────────────────────────────────────────┘
                │ same code, different host
┌───────────────▼─────────────────────────────────────────────────┐
│  Node CLI: HEADLESS RUNNER                                      │
│   - batch campaigns for balance → CSV/JSON output               │
│   - analyzed with Python/pandas or DuckDB                       │
└─────────────────────────────────────────────────────────────────┘

Content (YAML: events, genome traits, countries, sponsors)
   → validated by Zod schemas at build/load → consumed by sim core
```

**Core principles:**
- The simulation core imports nothing from the UI, Electron, or Steam.
- All balance numbers live in content/config files, never hardcoded.
- The simulation is deterministic: the same seed and inputs produce the same campaign.
- The UI updates once per turn from a simulation snapshot rather than continuously.

---

## 6. Technology Stack

### 6.1 Summary

| Layer | Pick | Purpose |
|---|---|---|
| Project setup / dev server | **electron-vite** | Instant reload while developing |
| Packaging | **electron-builder** | Builds the Steam-ready app directory |
| UI framework | **React** | Panels, tables, menus, tooltips |
| Styling | **Tailwind CSS** (fully custom theme) | UI look via design tokens |
| Map & animation rendering | **PixiJS v8** | Heatmap map, effects, particles |
| Map projection & data | **d3-geo** + **world-atlas** (Natural Earth) + **mapshaper** | Country shapes and flat-map projection |
| Map pan/zoom | **pixi-viewport** | Smooth navigation |
| React ↔ Pixi | **@pixi/react** | Embeds the map in React screens |
| Choreographed moments | **GSAP** (now fully free, including plugins) | Tier-ups, championships, inductions |
| Sim threading | **Web Worker + Comlink** | Simulation off the UI thread |
| UI state | **Zustand** | Lightweight store |
| Tables & long lists | **TanStack Table + TanStack Virtual** | Sortable, virtualized rosters |
| Menus, dialogs, tooltips | **Radix UI** (unstyled) + **Floating UI** | Accessible primitives; nested tooltips |
| Charts | **D3** drawing SVG | Custom almanac-style charts |
| Content format | **YAML** | Human-friendly event/trait writing |
| Content validation | **Zod** | Catches bad content at load with clear errors |
| Localization | **i18next** | Strings in files from day one |
| Randomness | **pure-rand** (seeded) | Deterministic simulation |
| Player names | **Faker** locales (curated) | Country-appropriate names |
| Saves | **JSON + Node zlib** | Compressed, versioned saves; main-process gzip, no additional dependency |
| Audio | **Howler.js** | Music and SFX |
| Unit tests | **Vitest** | Simulation tests |
| End-to-end tests | **Playwright** (Electron mode) | AI drives the real game, screenshots, smoke tests |
| Type checking | **TypeScript strict mode** | Catches errors before running |
| Lint/format | **Biome** | One tool instead of ESLint + Prettier |
| Crash reporting | **Sentry** (Electron SDK) | Player crash reports with context |
| Steam | **steamworks.js** (fallback: **steamworks-ffi-node**) | Achievements, leaderboards, cloud, overlay |
| Fonts | **Fontsource** (bundled locally) | Offline-safe typography |

### 6.2 Key Choices Explained

**UI framework — React.** Largest AI training corpus and component ecosystem. Known pitfall
(excessive re-renders) is minor in a turn-based game where the UI updates per turn.
*Considered:* Svelte 5 (AI frequently mixes Svelte 4 and 5 syntax — the same version-confusion
problem avoided by skipping Godot), Solid and Vue (less AI fluency, smaller ecosystems).

**Map rendering — PixiJS.** Smooth pan/zoom and animated heatmap effects fit the stylized direction.
*Considered:* plain SVG + D3 (simplest hover/click, weaker for heavy effects — acceptable fallback),
Three.js globe (excellent for vertical-video key moments; optional later, not the main map),
deck.gl/MapLibre (dashboard aesthetic conflicts with illustrated art direction).
**Design note:** Microstates (Singapore, Malta, Caribbean islands) are too small to click. Plan
markers or a zoom treatment early.

**Animation — GSAP.** Timeline sequencing suits choreographed key-moment screens, and it animates
both DOM and Pixi objects. *Optional additions:* Motion (everyday UI transitions), Rive
(interactive artist-made vector animation — strong fit with an illustrator), Lottie (After Effects
exports).

**Content — YAML + Zod.** Content lives in files, not code. YAML supports comments and multi-line
text for event writing. Zod validates every file at load, turning AI typos into clear errors
instead of silent mid-campaign bugs. Also makes future modding nearly free.

**Story text.**
- *Primary:* custom event templates (conditions → text → choices → effects).
- *Headline variety:* Tracery-style grammars, **English-only flavor text** — grammar-assembled
  sentences break localization.
- *Optional:* Ink (inkjs) only if events grow into multi-step branching storylines.

**Localization — i18next from day one.** Near-zero cost now, painful retrofit later. Use its
plural/gender handling; never concatenate sentence fragments.

**Seeded randomness.** Every roll goes through one seeded generator so any campaign is reproducible
("seed 4471 collapses the anchor league in year 12").

**Player names — Faker.** Head start on names for dozens of locales; coverage varies, so curate and
fill gaps.

**Saves.**
- Compressed JSON (gzip through Node's built-in zlib in the Electron main process).
  Implemented 2026-09-26: `.sfsave` files wrap simulation format 7 in session format 1,
  preserving country history and pinned country. Existing plain JSON saves still import.
  This replaces the proposed fflate dependency; a future browser port will need a browser codec.
  Format 7 adds pending events, recent receipts, cooldowns and temporary local effects;
  format 6 migrates without replaying old landmarks as new rewards.
- Every save carries a format version, with migration steps so Early Access saves remain loadable.
- Atomic writes: write to a temp file, then swap, so a crash mid-save can't corrupt a campaign.
- Steam Cloud sync is deferred with Steam integration; current files are local.
- Never use formats that break when code changes.

### 6.3 Avoid List

| Avoid | Reason |
|---|---|
| Phaser or other full game frameworks | Competes with React for control of the screen; PixiJS already covers rendering |
| Pre-styled component kits (MUI, Ant Design, Chakra, default shadcn) | Instantly reads as a business web app |
| Additional native modules (e.g., `better-sqlite3`) | Each one reintroduces Electron-upgrade breakage; steamworks.js should be the only one |
| Redux | Excess boilerplate for a turn-based game |
| Remote fonts, CDNs, any online content in the game window | Must work offline; required for Steam overlay security posture (Section 8.4) |
| Generic icon packs as the primary visual language | Fine as placeholders; erodes illustrated identity if kept |

### 6.4 Adoption Timeline

| When | Add |
|---|---|
| **Phase 0 (day one)** | electron-vite, React, TypeScript strict, Biome, Git, PixiJS + d3-geo + world-atlas, Zustand, Web Worker + Comlink, Zod + YAML, pure-rand, Vitest, i18next |
| **Once the game is playable** | steamworks.js with a test achievement, Steam overlay in a packaged build |
| **As matching systems are built** | TanStack Table/Virtual (league sim), Radix + Floating UI (business layer), D3 charts, Faker names, GSAP key moments, save versioning/migrations |
| **Before Early Access** | Playwright smoke tests, Sentry, Howler audio, electron-builder packaging for Steam |
| **Optional / later** | Motion, Rive or Lottie (with an artist), Three.js globe moments, Ink, DuckDB balance analysis |

---

## 7. AI-Steered Development Workflow

**What the AI handles:** implementation, tests, running the game, screenshots via browser/Playwright,
reading errors, packaging.

**What stays with the developer:**
- Design decisions and playtesting — AI can build a system but can't judge whether it's fun.
- Recognizing loops: if the AI has tried three fixes for the same bug, stop it and ask it to
  explain the root cause before changing anything else.
- Judging balance through headless-runner output (e.g., "anchor collapse rate across 500 campaigns")
  rather than reading code.

**Safety nets:**
- **Git from day one.** Every AI change is reversible.
- **`CLAUDE.md` with architecture rules** (Section 10) to prevent drift across sessions — the
  largest long-term risk for a developer who doesn't read code.
- **Headless runner and tests early.** Catches plausible-looking but wrong balance math.
- **Pinned versions, deliberate upgrades** (Section 8).

---

## 8. Electron & Steam Version Policy

### 8.1 How Electron Updates Work

- Electron ships a new major version **every 8 weeks**, aligned with Chromium.
- Only the **latest three stable majors** are supported (~6 months of support per version).
- Changed/removed functionality is kept for at least two major versions when possible.
- **Nothing updates on players' machines on its own.** Players run exactly the Electron version
  that was shipped.

### 8.2 Where Problems Actually Come From

1. **Large upgrade jumps** stack many breaking changes (window behavior, fullscreen, file paths,
   startup).
2. **Chromium rendering changes** can affect PixiJS performance, font rendering, and especially
   the **Steam overlay**, which hooks into graphics and is already fragile in Electron (known
   issues: white overlay, video elements breaking it, Linux overlay problems).
3. **External forces** — OS updates, GPU drivers, SteamOS changes, packaging/signing tool
   requirements — can force an upgrade at an inconvenient time.
4. **AI traps:** writing code for the wrong Electron version (e.g., the long-removed `remote`
   module), or "helpfully" running `npm update` / installing the latest Electron mid-task.
5. **Steam library maintenance.** steamworks.js is built on Node-API (`napi6`), which stays
   compatible across Electron versions, so version *matching* is rarely a problem. The real risk is
   stagnation: the last npm publish is **0.4.0 (August 2024)**; repository commits continued
   through September 2025 without a new release. Achievements, leaderboards, and cloud saves are
   long-stable on Valve's side, so this is acceptable for now. **Fallback:** `steamworks-ffi-node`,
   or fork and build steamworks.js (requires Rust + CI).

### 8.3 Upgrade Rules

1. **Pin exact versions** of Electron, steamworks.js, PixiJS, and electron-builder. Commit the
   lockfile.
2. **Never upgrade** Electron or the Steam library unless explicitly requested. Never run
   `npm update` unprompted.
3. **Upgrade on a schedule:** roughly every 6 months or at milestones, jumping 2–3 majors.
   **Never within a month of a launch, sale, or major update.** Freeze versions before Early
   Access and before 1.0.
4. **Always upgrade on a Git branch.**
5. **Run the upgrade checklist** (automate via Playwright where possible):
   - Game launches
   - Steam overlay opens (Shift+Tab)
   - Test achievement unlocks
   - Save/load works; Steam Cloud syncs
   - Fullscreen and resolution changes work
   - A key animated moment screen renders correctly
   - Runs on Steam Deck
   - Mac build launches (if shipping Mac)
6. **Isolate Steam** behind a single adapter file so a library swap is a contained job.

**Expected cost with this policy:** a few hours, about twice a year. **Without it:** a large,
painful catch-up upgrade, likely at a bad time.

### 8.4 Security Posture

- The Steam overlay requires `contextIsolation: false` and `nodeIntegration: true`, and
  `electronEnableSteamOverlay()` called at the end of `main.js`. This is acceptable **only
  because the game never displays remote content.**
- **Never load online content in the game window** (remote news feeds, embedded web pages,
  downloaded mods that execute code).
- **Open all external links** (Discord, wiki, store page) in the system browser.
- Given the above, running a no-longer-supported Electron version is low risk for this offline
  game.

### 8.5 Contrast With the Rejected pywebview Approach

| | Electron | pywebview (WebView2) |
|---|---|---|
| Who controls the engine version | Developer | Microsoft |
| Upgrades require developer work | Yes | No |
| Engine can change without a game update | No | Yes |
| When an engine change breaks something | Found during planned upgrade testing | Found by players first |

---

## 9. Quality, Testing & Balance

### 9.1 Automated Testing
- **Vitest:** simulation rules (e.g., "a league with negative cash for 3 seasons drops a health
  tier").
- **Playwright (Electron):** launches the real game, clicks through screens, captures screenshots;
  also runs the upgrade checklist.
- **TypeScript strict + Biome:** checks run every session before a change is considered done.

### 9.2 Content Validation
All YAML content is validated by Zod schemas. Invalid content fails loudly with the file name and
field.

### 9.3 Balance Workflow
1. Headless Node runner executes N seeded campaigns with strategy bots that use only legal player
   actions (Section 2.1).
2. Results written to CSV/JSON.
3. Analyzed with Python + pandas (notebooks) or DuckDB.
4. Target metrics tracked per build, for example: anchor collapse rate, time to each PP tier,
   genome diversity of winning runs, late-game win certainty, rival share over time.

### 9.4 Crash Reporting
Sentry Electron SDK captures crashes with context. Disclose it in the privacy policy and provide
an opt-out.

---

## 10. Proposed `CLAUDE.md` Rules

To be copied into `CLAUDE.md` when the repository is created:

```markdown
## Architecture
- The simulation core is pure TypeScript. It must never import UI, DOM, Electron, or Steam code.
- The simulation is deterministic. All randomness goes through the seeded RNG. No Math.random().
- All balance numbers live in content/config files, never hardcoded in logic.
- All game content is YAML validated by Zod schemas.
- All player-facing strings go through i18next. Never concatenate sentence fragments.
- All Steam calls go through the single Steam adapter file.

## Versions
- Electron, steamworks.js, PixiJS, and electron-builder are pinned to exact versions.
- Never upgrade dependencies or run `npm update` unless explicitly asked.
- Dependency upgrades happen only on a dedicated git branch and must pass the upgrade checklist.
- Do not add native Node modules.

## Security
- Never load remote content in the game window.
- Open external links in the system browser.

## Saves
- Every save includes a format version. Format changes require a migration step.
- Saves are written atomically (temp file, then swap). Never use formats that break when code
  changes.

## Workflow
- Run type check, Biome, and tests before declaring a change done.
- For UI changes, run the game and screenshot the affected screen.
- If a bug survives three fix attempts, stop and explain the root cause before trying again.

## Avoid
- Phaser, Redux, pre-styled component kits (MUI/Ant/Chakra/default shadcn), remote fonts/CDNs.
```

---

## 11. Commercial Plan

### 11.1 Positioning
- **Primary audience:** strategy players (Plague Inc, Rebel Inc fans), *not* sports-management
  fans. The invented sport requires no real-sports knowledge — a strength.
- **Why not lead with sports management:** Football Manager fans expect to run a club; this game
  operates at the level of the whole sport. Marketing to both dilutes the message.
- **Hook:** "I invented a sport and it overtook soccer."

### 11.2 Market Context
- A quick search found no direct "invent a sport and spread it globally" competitor on Steam
  (closest: promotion builders such as *Pound for Pound*, and *Pro Wrestling Sim*'s editor).
  A thorough Steam tag sweep is still needed.
- Precedent: Plague Inc began as one person's evenings-and-afternoons project (released May 2012).
  *Plague Inc: Evolved* (PC/console) has sold 2M+ copies, though most of the franchise's success
  came from mobile.
- Management/sim niches on Steam tend to have demand exceeding quality supply.
- Typical indie games on Steam sell in the hundreds to low thousands of copies.

### 11.3 Realistic Outcome Ranges
(assuming polished execution, demo, Next Fest, and consistent short-form marketing)

| Outcome | Copies | Notes |
|---|---|---|
| Solid | 10k–50k | At $19.99–24.99 |
| Breakout | 100k+ | Requires a viral moment; plausible given the hook, not plannable |
| Net per copy | ~$8–12 lifetime | After Steam's cut, regional pricing, discounts, refunds |

### 11.4 Marketing Levers
- **9x16 key-moment screens** (GDD standing discipline) for short-form video.
- **Free browser demo** of Phase 0/early builds (itch.io).
- **Shareable sport identity:** procedural rulebook/field diagram/logo (see Section 3, item 11).
- **Early Access** suits a systems-driven sim.
- **Steam Next Fest** with a demo.
- **Steam Deck Verified** status helps strategy/sim sales.

### 11.5 Validation Before Committing Years
1. Publish a Steam page early (capsule + short hook trailer) and track wishlist conversion. Target
   **7–10k+ wishlists by launch at minimum**.
2. Post short videos of the Phase 0 prototype to test whether the hook lands.
3. Consider a free public browser build of Phase 0.

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Development length (4–9 yrs at spare-time pace) leads to burnout, market shift, or imitators | High | High | Phase 0 slice; early Steam page; Early Access |
| Genome choices feel cosmetic | Medium | Critical | Specify affinity model before building (Section 3) |
| Story content volume underestimated | High | High | Budget 300–800 templates; grammar variety for English flavor; time limit per phase |
| Player sim depth becomes a time sink | High | Medium | Build only depth that stories consume |
| Late game lacks stakes / snowballs | Medium | High | Global pressure source (Section 3, item 9); track late-game win certainty in balance runs |
| Micromanagement at scale | Medium | Medium | Deep management only at the flagship (the player's seat); elsewhere standing policies and league directors |
| steamworks.js stagnates | Medium | Medium | Steam adapter isolation; steamworks-ffi-node fallback |
| Steam overlay breaks after Electron upgrade | Medium | Low–Medium | Upgrade checklist; scheduled small upgrades |
| Architecture drift across AI sessions | High | High | `CLAUDE.md` rules; tests; headless runner; Git |
| Trademark exposure (World Cup, Olympics, league brands) | Medium | High | Fictional names throughout |
| Single-campaign structure hurts replay reviews | Medium | High | Anchor-country and genome choice as replay levers in main mode |
| Positioning dilution (strategy vs. sports-management audiences) | Medium | Medium | Market as strategy-first |

---

## 13. Next Steps

1. ~~**Resolve design prerequisites 1–4**~~ — done 2026-09-12 (GDD v1.1), along with items 5–12.
2. ~~Define Phase 0 exit criteria in measurable terms.~~ — done 2026-09-13 (Section 2.1).
3. Create the repository: Git, electron-vite + React + TypeScript strict, Biome, Vitest, and
   `CLAUDE.md` from Section 10.
4. ~~First technical proof: Steam test achievement + overlay~~ — deferred 2026-09-13 until the
   game is playable.
5. Build the headless runner and seeded RNG before any UI polish.
6. Stand up the Steam page once Phase 0 has a presentable map.
7. Compile the real-world dataset (AI research session, sources file, tagged estimates) alongside
   the genome and spread work, which proceeds on invented placeholder countries. The developer
   spot-checks ~10 key markets before the data feeds balance runs.

---

## Appendix A — GDD Review Summary

### Pros (concept)
- Distinctive, easily pitched hook in a seemingly open niche.
- Proven spread/heatmap fantasy applied to a theme that fits it.
- No real-sports knowledge required.
- Turn pacing mirrors the inventor-to-operator arc.
- Anchor-country loss condition creates meaningful attention tension.
- Rivals that defend (not hunt) fit the theme and reduce AI cost.
- Built-in marketing via the 9x16 key-moment discipline.
- Dry almanac humor is cheap to produce and hard to copy.

### Cons (concept as designed)
- Plague Inc (short, replayable) and Football Manager (deep, long) references pull in opposite
  directions; single-campaign structure undercuts replay.
- Deep player sim with low direct player agency.
- Late game risks having no stakes.
- Turn compression thins stories out exactly when scale peaks.
- Per-country cash management scales into micromanagement.
- Currency terms conflated (country popularity, PP, fandom share); venue attendance feeding
  popularity conflicts with "Cash does not feed back into PP."
- Deferring black-hole analysis leaves obvious risks unmanaged.

### What the GDD does well (craft)
- Testable north star and a clear filter for features.
- Dependency-based phasing that suits spare-time development.
- Tiered simulation depth as the answer to scale.
- Both good-run and bad-run textures described.
- Disciplined scope instincts (scripted tournaments, lightweight national teams).
- Explicit parking lot; design separated from build planning.
- Minor housekeeping: "Section 7 Notes" references numbering the GDD doesn't use.

---

## Appendix B — Sources

- [Electron Releases / timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [New Electron Release Cadence](https://www.electronjs.org/blog/8-week-cadence)
- [Electron release schedule](https://releases.electronjs.org/schedule)
- [Electron end-of-life dates](https://endoflife.date/electron)
- [ceifa/steamworks.js](https://github.com/ceifa/steamworks.js/) · [Cargo.toml](https://raw.githubusercontent.com/ceifa/steamworks.js/main/Cargo.toml) · [commits](https://github.com/ceifa/steamworks.js/commits/main) · [overlay issues](https://github.com/ceifa/steamworks.js/issues?q=is%3Aissue+electron+overlay)
- npm registry data for steamworks.js (registry.npmjs.org/steamworks.js)
- [Electron Integration – steamworks.js (DeepWiki)](https://deepwiki.com/ceifa/steamworks.js/6.1-electron-integration)
- [steamworks-ffi-node](https://dev.to/arty_prof/steamworks-ffi-node-a-steamworks-sdk-library-for-javascript-game-frameworks-15h1) · [overlay docs](https://github.com/ArtyProf/steamworks-ffi-node/blob/main/docs/STEAM_OVERLAY_INTEGRATION.md)
- [philippj/SteamworksPy](https://github.com/philippj/SteamworksPy)
- [WebView2 on Linux+Proton discussion](https://github.com/MicrosoftEdge/WebView2Feedback/discussions/3076) · [issue #3127](https://github.com/MicrosoftEdge/WebView2Feedback/issues/3127)
- [Steam discussion: WebView2 doesn't run under Proton](https://steamcommunity.com/app/3451970/discussions/0/669472405704577652/) · [WebView2 on Linux/Steam Deck](https://steamcommunity.com/app/3537690/discussions/0/592902882169193340/)
- [pywebview WebView2 initialization issue](https://github.com/r0x0r/pywebview/issues/1012)
- [PyInstaller antivirus false positives](https://www.pythonguis.com/faq/problems-with-antivirus-software-and-pyinstaller/) · [PyInstaller issue #6754](https://github.com/pyinstaller/pyinstaller/issues/6754) · [PyInstaller to Nuitka](https://dev.to/weisshufer/from-pyinstaller-to-nuitka-convert-python-to-exe-without-false-positives-19jf) · [MeCopy Steam discussion](https://steamcommunity.com/discussions/forum/0/6725643950984147994/)
- [Plague Inc: Evolved 2M copies (Ndemic)](https://www.ndemiccreations.com/en/news/140-plague-inc-evolved-goes-double-platinum-with-2-million-copies-sold) · [Plague Inc. (Wikipedia)](https://en.wikipedia.org/wiki/Plague_Inc.) · [Ndemic – About](https://www.ndemiccreations.com/en/18-about-us)
- [Indie game sales statistics 2026](https://www.steampageanalyzer.com/blog/indie-game-sales-statistics)
- [Pro Wrestling Sim on Steam](https://store.steampowered.com/app/1157700/Pro_Wrestling_Sim/) · [Sports management sim roundup (Mega Cat Studios)](https://megacatstudios.com/blogs/game-culture/be-like-coach-cat-ter-the-best-sports-management-simulation-games)
