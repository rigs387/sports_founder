# Sports Founder — Game Design Document
*Version 1.34 | October 8, 2026 — all core and Phase 2 design decisions made; Phase 0 build gaps being closed (v1.4: slow hardcore poaching between sports; v1.5: Phase 0 growth tree, generational turnover rules, "choose pain"; v1.6: the real-world dataset as built; v1.7: the win needs tier 5, rivals hold their ground; v1.8: the win hold is a contest; v1.9: growth node prices grow with the sport; v1.10: climate conditions are relative to the world; v1.11: the player is commissioner of the flagship league; v1.12: culture emerges as traditions, founding character, backed stars, artifacts and famous venues; v1.13: the seat moves only to Professional leagues and returns home when a flagship folds; v1.14: the flagship season — club counts by tier, a European or American format chosen at creation, drifting club strength, the purist cost of moving the seat; v1.15: the flagship season as event cards; v1.16: flagship stars; v1.17: rivals win ground back near #1 — reclaim and world championships; v1.18: sport identity — names, founding club and ground, founding character, terms, emblem, rulebook and field diagram; v1.19: turn-based core kept, auto-advance as the real-time feel; v1.20: rules evolution, first build — amendments, purist backlash, dated rulebook; v1.21: big markets are many audiences, wealth levels weigh Prestige and rival defense, purists remember the founding rules; v1.22: culture, first build — six tradition types born from facts, stickiness, betrayal, founding character, the Culture category; v1.23: the flagship broadcasts — media reach earned by season interest and league health, season pulses, a ripple when it fails; v1.24: living time — play and pause with speeds, cards pop up as they happen, the offseason screen; v1.25: the clock is dropped after playtest — Next Turn stays, cards pop up after each turn; v1.26: moments have weight — minor toasts, big back pages, headline front pages, flagship scaling with its tier; v1.27: the broadcast lifts all media where it airs; v1.28: flagship deals — slots, offers, locked terms, demands that never block, rule demands rare; v1.29: partners want the product — balance, star and fan clauses, satisfaction instead of a cliff; v1.30: venues — a hard gate cap, built over seasons, record crowds and modernization; payroll — star wages that rise with careers; standing policies parked; v1.31: what the sport remembers — a lightweight Hall of Fame and the Almanac, chants and anthems; the gear brand stays a deal partner; v1.32: playtest follow-ups — no worthless deal offers, minor news collects itself, front pages for rare stories only, firsts with scale; card PP scaling tried and reverted; v1.33: awards and lightweight press; v1.34: second playtest follow-ups — PP prices in quarters of income, money in dollars benchmarked on real leagues, rival TV lockouts cut offers instead of blocking, attendance against max capacity, realistic scorelines, digital press by weight, a leagues overview with bulk promotion, stale firsts skipped; no Britishisms by default)*

---

## Core Fantasy

You are the Naismith of your sport — inventing a backyard game and growing it into a global
phenomenon. You start as inventor, then become operator, but the inventor identity never fully
retires: you can revisit and evolve your sport's rules throughout the game. The stories your sport
generates — rivalries, breakout stars, championship moments — are what make the heatmap's global
growth feel *earned* rather than just a number climbing. Rival sports are the antidote: entrenched
incumbents actively defending their turf as your creation encroaches.

**North star sentence:** *An underdog visionary turns a backyard game into a global religion, one
earned story at a time.*

**Holistic design rule: choose pain (decided 2026-09-13).** When a design question has an easier and
a harsher answer and nothing else settles it, choose the harsher one: rivals stay entrenched,
setbacks stick, shortcuts cost. The game is about earning a global sport against real resistance.

---

## Game Loop

**Primary loop (two-tier):**
- **Global layer:** Spend Popularity Points (PP) on growth nodes (grassroots, media,
  infrastructure, culture, global).
- **Country layer:** Operator decisions within each active market — sponsor deals, rule-change
  responses, rivalry management, reacting to rival-sport pushback.

**Turn structure:** Variable-pace turns, with turn length set by the current PP tier (1–5). Tier 1
runs on quarters — fast, granular, matches the scrappy inventor era. Higher tiers use longer turns,
reaching full years at the top — macro, operator era. Exact turn length per tier is a config
value. This pacing shift directly mirrors the inventor-to-operator arc.

**Simulation time step:** Regardless of turn length, the simulation always advances in in-game
quarters. PP income, fan conversion, churn, and decay accrue per quarter and are summed across the
turn. Longer turns change how often the player decides, not the economy's math.

**Time advancement rules:**
- **Turns always complete.** Nothing interrupts a turn mid-simulation.
- **Guaranteed warning.** The League Health Ladder moves at most one step per turn, and a league
  must spend a full turn at Near-Collapse before it can collapse. No run ends on a collapse the
  player never saw coming, at any turn length.
- **Tier-ups mid-turn:** the new turn length applies starting next turn.
- **The offseason (renamed from the seasonal window, v1.24):** one per in-game year, opening on
  the first turn that starts after the flagship season ends. At quarter-length turns it is one
  turn in four; at year-length turns every turn starts with one.
- **Auto-advance (dropped 2026-10-05, v1.25; see Living time below):** an optional "advance until something happens" control that
  always stops for decision cards, offseasons, League Health Ladder changes (anchor always;
  others in focus countries), PP tier-ups, rival moves in focus countries, and the start of the win
  hold / the win. Interrupt list lives in config.
- **Turn-based, not real-time (decided 2026-10-04, v1.19).** Real-time with pause (Paradox style)
  was considered and rejected for the core. That model works when many fine-grained things move
  at once and attention is the scarce resource; here spread moves by the quarter, league business
  and seasons by the year, and decisions are few and deliberate, so a running clock would mostly
  be waiting. Several rules are defined in turns (the decision cap, End Turn settling defaults,
  turn length by PP tier, the win hold, every pacing target), and "choose pain" relies on
  deliberate tradeoffs, not reflexes. The living-world feel comes from **auto-advance** instead:
  a Play / Pause control with two or three speeds that ends turns on its own and stops on the
  interrupt list above (plus a star who can be backed in the offseason, and any card that
  needs an answer), like Football Manager's Continue or Plague Inc's speed controls. It is a
  presentation layer over End Turn: no simulation, balance or save change, so it can be built at
  any time. Open when it is built: the speeds, whether it is on by default, and whether the map
  animates between auto-played turns.
- **Living time and the offseason (decided 2026-10-05, v1.24).** The first full playtest loved
  the game but found the turn clicking flat, the choice board stiff and the seasonal window never
  usable. Measured in the real game: the window opened on turns 3 and 7, but the first star
  arrived on turn 4 (the season ends inside the window's turn, so its cards land after it
  closes), nothing announced the window, and on turn 7 backing cost 60 PP against about 39.
  - *Turns stay turns (revised 2026-10-05, v1.25).* A Crusader Kings clock was built (Play /
    Pause, three speeds, the date ticking quarter by quarter with the heat blending, self-pausing
    on an interrupt list and resuming after an answer) and played. It was removed the same day:
    the quarter-by-quarter replay was choppy and the self-pauses were jarring. The game keeps
    Next Turn with tier-scaled turn lengths (no balance change). What stays: the date is the
    headline of the bottom bar (the turn number below it), and the v1.19 auto-advance idea is
    dropped with the clock.
  - *Choices pop up after each turn.* After Next Turn, the turn's decisions appear one at a time
    as event windows over the map, with their country highlighted, in the order their facts
    happened (each card records its quarter): the story, then two or three choice buttons, each
    with a one-line effect and the full detail on hover. No separate review step, except a confirm
    when a choice costs PP. Moments without a choice are map pickups and toasts. The board becomes
    the journal of past cards. Answers take effect from the next turn, as before.
  - *The offseason screen.* When the offseason opens, the turn opens on one screen in a set order:
    the season review (champion, new star, stories), then everything the offseason allows in one
    place — back or drop stars, amend a rule, promote leagues, move the seat, name or rename the
    trophy — each showing its price against the PP the player has ("60 PP · you have 39"). It
    stays open until the player plays the next turn. It is the home of future league business: sponsors, TV
    deals and the rest of the business layer arrive here. With it, locked controls elsewhere need
    no countdowns. *Built 2026-10-05 (step 5):* it opens by itself only when the player is on the
    world map (taking over another screen mid-task was disruptive); elsewhere its tab appears in
    the nav while the offseason is open. The Flagship tab and the Rulebook show stars, the seat,
    the trophy and the rules read-only. Promotions list the five leagues with the biggest
    followings, with the rest a click away; the season's decisions stay on the map, and the review
    says how many wait there.
  - *Offseason timing.* The offseason opens on the first turn that starts after the season ends,
    so the season's cards and its new star are in front of the player while it is open.
    Offseason actions take effect when it closes, before the next season's first matches (a seat
    move included). This is a small sim change; the win contest is remeasured once.
    *Built 2026-10-05 (step 1):* a season started by closing the offseason lasts a full year, so
    with every turn length dividing a year it ends on a turn boundary (after a tier change, at
    most one season ends mid-turn and the rest of that turn is a break with no matches). The
    campaign's first season, and one restarted when the seat is sent home, run to the configured
    quarter. Retired players are replaced when the season ends, so the offseason shows every
    club's new leading player; the club count follows the tier when it closes. A star dropped in
    the offseason is recorded against the season just finished.
  - *The backing price stays (choose pain).* 60 PP base: the first star is usually not affordable
    in their first offseason, and the screen shows the gap as a goal to save toward.

**Turn anatomy:** (v1.25: decisions pop up over the map after Next Turn, in the order they
happened; the offseason gathers league business on its own screen.)
1. **Recap** — map animates the elapsed quarters; pickups appear; headlines.
2. **Decisions** — 0–3 decision cards.
3. **Global** — spend PP on growth nodes, reassign focus slots, change rules.
4. **Leagues** — operator decisions in active markets (see League attention below).
5. **End turn** — simulation runs the turn's quarters.

| | First 10 min (tier 1) | Mid game (tier 3) | Late game (tier 5) |
|---|---|---|---|
| Turn length | Quarter | ~Half-year | Year |
| Active markets | 1 (anchor) | 6–12 | 30+ |
| Focus slots | 1 | 3 | 5–6 |
| Pickups per turn | 1–3 | 10–15 | 20–40 |
| Decision cards | 0–1 | 2 | 2–3 |
| Target real time per turn | ~1 min | ~3–5 min | ~5–8 min |

**Campaign setup:**
1. **Choose the anchor country** — every market is selectable (yes, Tuvalu). Each shows an
   automatic 1–5 star difficulty rating with short deadpan reasons ("Isolated: few neighbors."
   "Cricket is not a hobby here."), computed from population, wealth, rival hardcore saturation,
   neighbor/language connectivity, and media market size (weights in config). A few recommended
   starts are highlighted for first-time players.
2. **Design the genome** — with qualitative hints (+ / ++ / −) for the anchor country only. No
   world affinity preview; where the sport catches on abroad is discovered in play.
3. **Name the sport and the founding club** (generated default, editable); choose difficulty preset
   (Easy / Normal / Hard); optional visible, shareable seed. **Choose the season format (decided
   2026-10-02):** *European* (the league table decides the champion) or *American* (the same
   regular season, then playoffs). It is identity, not a genome trait: it never touches affinity,
   and it applies to the flagship wherever the seat goes.
4. **Founding character (decided 2026-09-26)** — gives the sport color beyond its rules:
   birthplace (e.g., schoolyard, factory, beach, barracks), ethos (e.g., gentleman's game,
   working-class game, rebel game), colors and a simple emblem (pulled forward from the Phase 2
   editor), and the sport's own terms (what a score, a match and a season are called). Birthplace
   and ethos seed Culture (which traditions tend to form and how fans react to change). They
   never touch affinity, so genome balance is unaffected. Terms are nouns placed into complete
   templates, never sentence fragments.
5. **Sport identity, as built first (decided 2026-10-04, v1.18).** One build covers names,
   founding character, terms, a preset emblem, the rulebook page and the field diagram; the full
   logo and kit editor and image export stay Phase 2.
   - *Names:* the sport's name (a generated default from the seed, editable, with a re-roll), the
     founding club and its ground. Free text is trimmed and length-limited (config).
   - *The founding club is a real flagship club at the anchor:* the player picks its town from the
     anchor's real places (places.yaml) and names it; its ground is named too, the first candidate
     for a famous venue. It plays like any club: its strength is rolled as founding clubs' are.
   - *Founding character:* a birthplace (schoolyard, factory, beach, barracks, village green,
     docks) and an ethos (gentleman's game, working-class game, rebel game, family game), chosen
     at setup now. Since v1.22 birthplace biases which traditions form and ethos how fans take betrayal (Culture).
   - *Terms:* what a score, a match and a season are called, chosen from preset nouns that carry
     singular, plural and title forms in the locale file; used only as nouns inside complete
     templates. Free text terms are not offered (they read badly in templates).
   - *Emblem:* a preset shape, icon and two colors from a palette. Shown in the campaign identity
     on the map, the flagship screen, the founding club's table row and the rulebook.
   - *Where it lives:* a Rulebook page under "Your sport": emblem, name, founding facts, the
     genome as almanac prose (odd trait pairings earn deadpan lines from content), and the field
     diagram drawn from surface, footprint, team size, equipment and play structure. Rule
     amendments join it with rules evolution.
   - *Saves:* older saves load with generated defaults (the anchor's first club becomes the
     founding club with its name unchanged).
   - *Built 2026-10-04:* setup is two pages (the sport, then the founding), each fitting the
     window. Players a side by team size: 5 / 8 / 11. The league's text (flagship screen, Stars
     panel, season and star cards) uses the sport's terms; the offseason keeps its name.

**Starting state:** the anchor country has a tiny founding Amateur league, a tiny hardcore base
(the founder's friends and family), and a small casual base. The player has a small PP stash. The
single focus slot starts on the anchor but can be moved, so attention tension begins on turn 1.
The loss condition is live from the start; early tuning keeps early collapse very unlikely. All
starting values in config.

**League attention (no inbox):** League operator decisions surface through three mechanisms, with
no list or inbox anywhere:
- **The map is the signal.** Countries needing attention show it directly on the map (pulsing
  border for a health drop, icon for a sponsor offer, rival color creeping in). A "next country
  needing attention" key prevents missed issues.
- **The offseason.** League business (sponsor and TV renewals, etc.) happens in the offseason
  rather than trickling in every turn — quiet turns punctuated by a busy offseason (v1.24).
- **Crises become decision cards.** Urgent league problems compete for the capped decision-card
  slots; anything that doesn't surface takes its free default (standing policies parked, v1.30).

**Delegation (scaling to 30+ markets):**
- **Standing policies (parked 2026-10-07, v1.30):** as first designed, a small set of global
  defaults with per-country overrides (minimum acceptable sponsor offer, ticket pricing stance,
  routine-crisis response) resolving offseason business the player doesn't touch. Since v1.11 there
  is nothing to delegate: other leagues run on the simple model with no business of their own,
  untouched flagship offers lapse, and event cards fall to their free defaults. Policies return if
  other leagues ever gain business (see the parking lot).
- **Focus slots define hands-on involvement.** Offseason business surfaces to the player only
  in focus countries; elsewhere it resolves via policy and reports as Moments. Focus means both
  "where I push growth" and "where I personally operate," which feeds anchor-neglect pressure.
- **The player is the commissioner of one league: the flagship (decided 2026-09-26).** Deep league
  management (named teams, standings, stars, real sponsor and TV deals) happens there and only
  there; see Flagship league. Every other league runs on the simple model.
  "Commissioner" is the player's title alone.
- **League directors (Phase 1, not Phase 0):** hireable per country for leagues other than the
  flagship; execute policies with trait-driven bias (e.g., Frugal banks cash and skips marginal
  sponsors; Showman pushes early promotion; Scandal-prone gets results but generates story
  events). Paid from league cash. They are also the advisor voice for league issues. (Named
  "commissioners" before v1.11.)
- **The player can always intervene** in any country directly. Delegation is a default, not a
  lock.

**League tiers:** Each country has a single top league (no multi-division pyramid, no promotion/
relegation). That league progresses through professionalization tiers, giving football-pyramid-
style gradations of maturity: **Amateur → Semi-Pro → Professional → Elite**.

- **Formation:** a country has fans only (no league) until its hardcore fans cross a threshold;
  then an Amateur league forms automatically (milestone pickup) and the country becomes an active
  market. The anchor country starts with an Amateur league.
- **Promotion is the player's call.** Once a league qualifies (hardcore fan base + cash reserve
  thresholds), the player may promote it during the offseason. Promotion costs cash and
  raises running costs — going pro too early can sink a league. (Contrast: PP tiers promote
  automatically.)
- **Relationship to the League Health Ladder:** health is the league's condition within its tier.
  - *Voluntary step-down:* a league at Near-Collapse may restructure one tier down, resetting to
    Struggling at the lower tier, with hardcore demotion and a major Moment. Can endanger a PP
    tier's breadth condition.
  - *Non-anchor collapse:* the league folds; fans remain; an Amateur league can re-form later.
  - *Anchor collapse:* ends the game at any league tier.
- **Flagship league:** one league worldwide is the sport's "top" league, designated by player
  assignment. The flagship attracts the best talent (stars transfer toward it), boosts the media
  reach spread channel from its country, and carries higher stakes (more revenue; its troubles
  ripple to fans worldwide). Multiple leagues can reach Elite.
- **The commissioner's seat (decided 2026-09-26).** The player personally runs the flagship. It
  answers playtesting that found the game thin: one league to care about, with the planned league
  and business depth concentrated where the player sits instead of spread thin across 30 markets.
  The depth must feed the global spread (talent, media reach, stories), never compete with it; the
  map stays the game.
  - *Starts at the anchor.* The anchor league is the flagship from turn 1, which fills the long
    Backyard Game stretch and ties the deepest league to the one whose collapse ends the run.
  - *Moving the seat hurts (choose pain).* The flagship is reassignable only during the
    offseason. The former flagship's country pays a purist cost (it feeds anchor resentment when the
    anchor is left), and its league drops to the simple model (or a
    league director, once they exist).
  - *Only Professional or Elite leagues can take the seat (decided 2026-10-02).* The anchor is the
    one exception: it holds the seat from turn 1 at any tier. Moving the seat abroad needs a
    league that has already professionalized, so the player cannot park the seat in a fresh
    Amateur league to dodge the anchor's troubles.
  - *A folded flagship sends the seat home (decided 2026-10-02).* When a non-anchor flagship
    collapses, the seat returns to the anchor at once, outside the offseason. The return is
    free: the collapse itself is the pain (its fans, cash and stories are lost), and the anchor
    gets its commissioner back.
  - *First build of the seat's depth:* named teams, results, standings and a few named stars
    (system 4), plus real sponsor and TV deals with length, annual value and demands (system 7).
    Venues, youth programs, expansion teams and full rosters come later.
  - *The flagship season (decided 2026-10-02).* One season per in-game year; the offseason
    follows its end (v1.24). Every club plays every other club home and away. European format: the top
    of the table is champion. American format: the top clubs (4 when there are 8 clubs, 8 from
    12 up) play single-match knockout playoffs, with the higher seed at home. Club counts grow
    with the league tier: 8 Amateur, 12 Semi-Pro, 16 Professional, 20 Elite (config); promotion
    admits generated expansion clubs, and a step-down drops the newest. Clubs are based in real
    towns and cities of the flagship's country with invented nicknames (no real clubs, and no
    invented places).
  - *Club strength (decided 2026-10-02).* Each club has a rating that drifts randomly every
    season and is pulled toward the league's financial health, so dynasties form and fade and a
    struggling league plays worse. Stars plug into this rating when they arrive.
  - *The purist cost of moving the seat (decided 2026-10-02).* The country the seat leaves loses
    a config share of its player hardcore fans to casual, a larger share when it leaves the
    anchor, and more where traditions are held (v1.22). Anchor resentment can replace the anchor share
    once it exists. The return home after a folded
    flagship costs nothing.
  - *Every other league* stays on the simple model: fan buckets, one cash line, the League Health
    Ladder, promotion and bailouts.

**Simulation depth by league tier** (the flagship; other leagues stay on the simple model):

| Stage | Simulated |
|---|---|
| No league | Fan buckets only |
| Amateur | Named teams, results, standings, one named leading player per club |
| Semi-Pro | + more star places (see Flagship stars) |
| Professional / Elite | Full rosters (a later phase; Phase 1 keeps one leading player per club, decided 2026-10-03) |

Even full rosters carry only what stories, records, and costs use: ratings, stats, careers,
transfers, and **contracts**. Contracts exist to build up the league's running cost (payroll
scales with player quality and league tier) — the player does not negotiate them. No training or
tactics. Phase 0 remains abstract (no individual players).

**Secondary loop:** Hitting popularity goals in specific countries/regions and watching the
resulting visible movement — new leagues forming, heatmap shifting, stories emerging. This is the
session-level payoff between "spend PP this turn" and "win globally."

**Primary decision:** Which country/market to push into next.

**Win condition:** Become the #1 sport by global Fandom Score (see Fan Model below) and hold #1
for X consecutive turns (X is a config value, set during balancing). Winning does not end the
campaign — the player can keep playing past the win.

- **The hold counts only at tier 5 (decided 2026-09-18).** A turn counts toward the hold only if
  it ends with the sport #1 *and* at PP tier 5 (Global Religion); a turn short of either starts
  the hold again. A Backyard Game cannot be the world's sport: a tiny anchor whose league never
  goes Semi-Pro stalls the tier track, and must not be able to win around it.
- **X = 30 turns** (set 2026-09-18 at 36, retuned 2026-09-19 once the hold became a contest). #1
  arrives a few turns after tier 5 on a typical anchor, and rivals then fight for it, so 30 puts
  the first win at about turn 200 (inside the pacing tolerance of the ~180 budget). Tier 5 turns are years: the hold is about 30 years.
- **The hold is a real contest (decided 2026-09-19).** Of the campaigns that take #1, about half
  lose it at least once before the win. See Late-Game Pressure.
  - *Rivals must be able to win ground back (decided 2026-10-04, v1.17).* Measured: once the
    player first passed the best rival, the lead only grew (about +1% of the rival's score every 5
    turns); every loss of #1 was a wobble in the first few turns at parity. Rivals that hold their
    ground and only slow the player cannot make a contest, and stronger defense made losses rarer.
    Two mechanisms fix it (choose pain): **reclaim**, a countermove near #1 that wins the player's
    hardcore fans back where a rival is the incumbent, and **world championships**, the rivals'
    dated quadrennial tournaments that lift them everywhere for a year. The target stays about
    half. Details under Rival AI.
  - *Built 2026-10-04:* a world championship lifts its rival's world Fandom Score about 1% at the
    peak (soccer 1.1%, cricket 1.4%) and fades over about three years, so the player must pull
    about 1% clear to ride one out. Reclaim acts only once the player is past #1 (the top of the
    near-top ramp), at 0.5% of their hardcore fans there per quarter for 12 quarters. Measured
    (pacing, builder, 12 anchors × 6 seeds, 200 turns): #1 lost before the win in 36 of 68
    campaigns (53%, was 33%); first win median turn 159–164 (was 158). A stronger first build
    stopped every campaign short of #1.
- Taking #1, losing it (and to which rival), and the win itself are permanent landmarks, recorded
  at any tier.

**Post-win play:**
- **Anchor collapse no longer ends the campaign** after the win. It becomes a major Moment ("The
  sport has outlived its birthplace") recorded permanently.
- **Legacy goals:** optional post-win targets (e.g., #1 on every continent, overtake soccer in its
  heartlands, five Elite leagues, a league in every market, a century as #1). Natural Steam
  achievements.
- **Rivals can retake #1.** Losing #1 is a Moment and it can be regained; the original win stays in
  the Almanac.
- **Retire:** available any time after the win; plays a final retrospective (heatmap timelapse,
  rulebook amendment history, Hall of Fame highlights) as a 9x16 key moment.

**Loss condition:** Before the win, the game ends if your *starting/anchor country's* league collapses (see League
Health Ladder below). A collapse on the turn the hold would complete still ends the game: the loss
is judged first. Other countries' leagues can collapse without ending the run — losing your
anchor market specifically ends it, because it's the soul of the sport you built.

---

## Systems — Build Phasing

*Note: this project has no fixed deadline and is built in open-ended, phased spare-time
development. Systems are not divided into "must have" vs. "cut" — they are sequenced by
dependency. Systems 1–8 constitute the point at which the core loop becomes playable/testable.
Systems 9–16 are real, planned, later-phase work in the same continuous build.*

**Phase 1 — Core loop (playable after this point):**
1. World map + country popularity — foundational; nothing else functions without it.
2. Sport creation/genome — the player's first real input; genome data feeds all downstream systems.
3. PP growth tree — the core global spend loop.
4. Persistent league/team/player simulation (tiered depth — see Progression & Economy).
5. Event/storytelling generator — what makes growth feel earned.
6. Rival-sport AI — the "antidote"/tension system.
7. Sponsor/TV/advertiser business layer — the operator-phase engine.
8. Rules-evolution system — the inventor identity's ongoing hook, available post-creation.

**Phase 1 additions (decided 2026-09-13):** lightweight versions of Hall of Fame, awards, and press
coverage move into Phase 1 — they are how stories reach the player, so the event generator can't
be judged without them. A simple venue capacity level is also needed in Phase 1 because gate
revenue is capped by it. Fuller versions remain in Phase 2.

**Phase 2 — Depth & richness (later-phase, same continuous build):**
9. Venue growth (mechanical — attendance accelerates casual → hardcore conversion; built
   alongside the business layer, not standalone).
10. Hall of Fame — a global "shrine," a persistent visible store of accumulated legacy/popularity
    over time.
11. Press coverage — flavor layer riding on top of the event generator.
12. World Championship — the sport's own World Cup-style tournament: scripted, single-elimination,
    every 4 years, using existing team-strength ratings (not a full qualification simulation). No
    multi-sport Games/Olympics equivalent.
13. National teams — lightweight roster-pull from top club players, built to support the
    World Championship.
14. Awards (e.g., league MVP) — pure content flavor.
15. Custom scenarios/challenges + Steam leaderboards — replayability layer, depends on a complete,
    tunable core loop. Planned scenario: a historical start (~1900) where the player's sport
    globalizes alongside real sports.
16. 9x16 camera-friendly design pass — not a standalone system; a visual discipline applied across
    key moment screens (see Tone & Art Direction).

---

## Progression & Economy

**Fan Model (per country, per sport):** Every country's population sits in three buckets for each
sport, your sport and rivals alike.

| Bucket | Meaning | Movement |
|---|---|---|
| **Uninterested** | Unaware of the sport, or aware and indifferent | Spread and media exposure move people out |
| **Casual** | Follows it sometimes | Converts fast, churns fast; decays back to uninterested without ongoing exposure |
| **Hardcore** | It's *their* sport | Converts slowly; very hard to lose |

- **Casual is non-exclusive.** A person can be a casual fan of several sports at once, including a
  sport another person — or they themselves — are not hardcore about.
- **Hardcore is exclusive.** A person is hardcore about at most one sport. Each country's hardcore
  population is a zero-sum pie split among sports, plus people with no hardcore sport. The
  casual → hardcore conversion is where sports actually compete, so rival defense emerges from
  the model.
- **Hardcore loss is demotion, not disappearance.** Hardcore fans drop to casual, never directly to
  uninterested, and only through specific causes: scandals, unpopular rule changes (purists),
  league health decline, or rival poaching. Casual loss is routine churn; hardcore loss is a
  visible event. The hardcore base is how the game represents strength built over time.
- **Winning over rival hardcore fans is slow (decided 2026-09-13).** Poaching works both ways and
  follows the same rule. Where a sport is strong, a small share of another sport's hardcore fans
  in that country demote to casual about the sport they held. From there they can become hardcore
  about the stronger sport through normal casual → hardcore conversion. The pull scales with local
  strength and is deliberately slow (rates in config): overtaking an entrenched sport takes decades,
  not seasons. The "other sports" bucket loses fans the same way but never defends. Rival defense
  slows the pull further.

**Fandom Score:** `hardcore fans + (casual fans × casual weight)`, using raw population counts,
summed across all countries. The casual weight (e.g., 0.3) is a config value. Casuals count, but
breadth alone cannot win — depth is required.

**Sport Genome:** The sport is defined by 10 trait axes (Phase 0), each with 3–4 discrete options
(decided 2026-09-13):

| Axis | Options | Kind |
|---|---|---|
| Surface | Grass field / Indoor court / Street / Ice | Identity |
| Equipment | Ball only / Ball + stick or bat / Protective gear | Identity |
| Physical profile | Speed / Strength / Precision / Endurance | Identity |
| Field footprint | Small / Medium / Large | Identity |
| Contact | None / Incidental / Full | Rule |
| Team size | Small (2–5) / Medium (6–9) / Large (10–15) | Rule |
| Match length | Short / Standard / Long (multi-hour or multi-session) | Rule |
| Scoring frequency | Low / Medium / High | Rule |
| Rules complexity | Simple / Moderate / Intricate | Rule |
| Play structure | Continuous / Stop-start / Innings | Rule |

Water as a surface option is parked for later.

- **Affinity = genome traits × country attributes.** Phase 0 country attributes: climate, wealth,
  urban density, existing sport culture (also the source of rival strength), media market size,
  language group.
- **Two conversion levers.** *Accessibility* (cost, simplicity, where it can be played) mainly
  accelerates uninterested → casual. *Depth* (strategy, skill ceiling, drama) mainly accelerates
  casual → hardcore. Wide-and-shallow vs. narrow-and-deep is a real strategic identity.
- **Levers attach to options, not whole axes.** Each option carries its own accessibility and
  depth modifiers, plus conditions on country attributes. Examples: Street is +accessibility in
  dense, lower-income countries; Ice is +affinity in cold countries and −affinity in hot ones;
  Intricate rules are +depth and −accessibility. All modifiers live in config.
- **Rival similarity.** Resembling a country's dominant rival makes casual conversion easier
  (familiar) and hardcore conversion harder (they already have that sport). Similarity is the
  weighted share of axes on which two genomes choose the same option (0–1), with per-axis weights
  in config. Every rival has its own genome in content.
- **No universal best option.** Design rule: every trait option helps in some countries and hurts
  in others. Verified in balance runs by the genome diversity of winning campaigns.
  - *Checked against the real countries (decided 2026-09-14):* content validation requires each
    option to help in, and hurt in, a real share of the actual countries. It is a guard so every
    choice stays a trade-off, not a literal law.
  - *Numeric conditions are relative to the world (decided 2026-09-14):* wealth, urban density,
    sport culture and media market conditions are neutral at the world's population-weighted
    average country and apply in full at the most extreme country. An option conditioned on wealth
    helps in richer-than-average countries and hurts in poorer ones, whatever the data's scale.
  - *Climate conditions are relative to the world too (decided 2026-09-21):* a climate condition
    is centred on the world's people, so an option's climate map averages out to nothing across the
    world and says only where the sport does better or worse than its own average. Geography
    decides *where* a sport catches on, never *whether* it can. Written literally, climate was a
    flat handicap that numeric conditions never had: the world's people are 45% tropical and 4%
    cold, so an option asking for cold paid its penalty across almost everyone and collected its
    bonus almost nowhere. The four options with the largest handicaps (Ice, Strength, Long, Continuous)
    were the four that balance runs never chose, and because an axis's top-quartile shares must add
    up to one, their dead weight was what pushed their neighbours past the dominance limit.
  - *Judged globally (decided 2026-09-14):* the no-dominant-genome check ranks campaigns by global
    Fandom Score, so a niche option must pay off enough in its niche to reach the top campaigns.
- **Identity vs. rule traits.** Identity traits (surface, equipment, physical profile, field
  footprint) are locked at creation and keep the sport recognizable. Rule traits (contact, team
  size, match length, scoring frequency, rules complexity, play structure) can change later
  through rules evolution, at a cost to hardcore purists.
- **All combinations are legal.** Odd pairings (ice with innings) earn deadpan rulebook lines;
  affinity handles the balance.

**Country attributes (Phase 0, decided 2026-09-13):** What affinity and spread read from each
market. All stored in content; every conversion curve and weight lives in config.

| Attribute | Values | Source |
|---|---|---|
| Climate | Tropical / Arid / Temperate / Cold | Main climate zones (Köppen groups) |
| Wealth | Real income per person → 0–1 score via config curve | Real-world data |
| Urban density | Real % urban population → 0–1 score via config curve | Real-world data |
| Existing sport culture | Share of population already hardcore about any sport (rivals + "other") | Derived from starting fan data |
| Media market size | Population × wealth score, shape set in config | Derived |
| Language group | One primary media sphere (~15 broad spheres) plus an optional secondary one | Content |
| Neighbors | Land borders plus hand-listed sea links (so islands have proximity spread) | Natural Earth + content |
| Continent | Africa / Asia / Europe / North America / South America / Oceania | Content |

- The secondary language sphere counts toward the language channel at a config weight (e.g.,
  India: Hindi-Urdu + English; Canada: English + French).
- Continent is what the tier-4 condition "pro leagues on N continents" counts.

**Big and rich markets (decided 2026-10-04, v1.21).** Every sport wants the population giants;
the game does not stop that, it makes them play differently.
- **A giant is many audiences.** Tastes vary inside India or China, so no rulebook can suit them
  strongly: a country's genome fit (every option's lever deltas) is softened the bigger its
  population is beyond a reference size (config). Giants are won by breadth and patience; fit
  is sharpest in mid-sized and small markets.
- **Wealth levels.** Each market has one of four wealth levels, named for what fans can spend on
  sport: **Shoestring, Modest, Comfortable, Affluent**. The income per person in the data is the
  World Bank's GNI per capita (Atlas method), the measure it classifies by, so the levels are its
  income groups (FY2026 thresholds for the 2024 figures). Each level carries config weights.
- **Wealth weighs Prestige.** PP income counts each market's Fandom Score × its wealth level's
  weight: a fan in the US earns more Prestige than a fan in India. The race for #1 still counts
  raw fans.
- **Rivals fight hardest where it matters most.** Rival defense is weighted by population ×
  wealth weight: rivals escalate sooner and spend first in big rich markets, so those are where
  the contest is fought.
- **Measuring:** genome differentiation is judged on the sport as invented (bots that never
  amend); the convergence that amendments cause is reported, not failed, because every sport
  adapting toward the same giant markets is natural.
- *Built 2026-10-04:* fit × min(1, (50M ÷ population) ^ 0.3), floor 0.3 (India about 0.36);
  Prestige weights 0.5 / 0.75 / 1 / 1.5; rival market value (population × weight ÷ 50M) ^ 0.15 in
  0.67–1.5, dividing escalation thresholds. Rich-market defense pushed #1 lost before the win to
  75%, so the world championships were scaled back (about a 0.75% lift): 37 of 70 (53%), first win
  median turn 163–169. Differentiation as invented 5 of 6 pairs (as before); with amendments the
  pairs share 3.8–7.2 top markets (reported).

**Real-world data (Phase 0, decided 2026-09-13):**
- **Markets:** FIFA member associations plus any cricket country missing from FIFA, limited to
  places with real sports salience (see Map and markets). Every addition or omission is noted with
  its reason.
- **Attributes:** population, income per person, and % urban from World Bank data, using one data
  year for all markets; national statistics offices fill gaps (UK home nations, some
  territories). Climate is the main zone where most people live, not most land (Australia is
  Temperate). Every field records its source and year.
- **Starting fan buckets (soccer, cricket):** published survey figures on sports interest where
  they exist ("very interested" → hardcore, "interested" → casual). Countries without surveys copy
  a similar neighbor. Every value is tagged with its source or "estimate: modeled on X".
- **"Other sports" bucket:** a default hardcore share per continent, overridden per country where
  another sport clearly dominates (e.g., the US, where Phase 0's "other" holds American football,
  basketball, and baseball).
- **Rival genomes:**

| Axis | Soccer | Cricket |
|---|---|---|
| Surface | Grass field | Grass field |
| Equipment | Ball only | Ball + stick or bat |
| Physical profile | Endurance | Precision |
| Field footprint | Large | Large |
| Contact | Incidental | None |
| Team size | Large | Large |
| Match length | Standard | Long |
| Scoring frequency | Low | High |
| Rules complexity | Simple | Intricate |
| Play structure | Continuous | Innings |

- **Compilation:** an AI research session builds the dataset as YAML plus a sources file, with
  estimates tagged. The developer spot-checks ~10 key markets (recommended starts, the biggest
  soccer and cricket countries) before the data is used for balance runs.
- **Built 2026-09-15 — 213 markets.** FIFA's 211 member associations minus Kosovo and Palestine,
  plus Tuvalu (an OFC associate, kept as the signature hard anchor) and the three ICC members
  outside FIFA (Jersey, Guernsey, Isle of Man). Saint Helena is left out: inactive ICC membership,
  about 4,000 people. The United Kingdom is not a market; its four home nations are. Population,
  income per person (GNI per capita, Atlas method) and urban share are World Bank 2024 figures,
  with national statistics offices filling the gaps; land borders come from GeoNames; climate,
  language spheres, sea links and the fan buckets are hand calls. `content/sources.yaml` records
  the source and year of every field, tags every estimate with what it was modeled on, and lists
  every addition and omission with its reason; content validation rejects a market missing any of
  it. A country's hardcore shares across all sports may not exceed `worldChecks.maxSportCulture`.

**Spread Model:** How the sport moves between countries.

- **Only casual exposure crosses borders.** Hardcore fans are always built locally (leagues,
  attendance, stories). A country's outbound spread strength = its hardcore + weighted casual fans
  (same formula as the Fandom Score), so hardcore fans are stronger evangelists.
- **Phase 0 channels:** *proximity* (neighbors: land borders plus hand-listed sea links),
  *language group* (shared primary or secondary media sphere), *media reach* (long jumps between
  large media markets). Diaspora and trade ties
  are later additions (they require per-country-pair data). PP growth nodes strengthen specific
  channels (e.g., media node → media reach, grassroots node → proximity).
- **Focus slots.** Pushing into a market means assigning it a focus slot, which boosts inbound
  spread and conversion there. The player starts with 1–2 slots and earns more at higher PP tiers.
  Slot scarcity keeps attention limited, which is what puts the anchor country at risk.
- **Cold launches allowed.** A country with zero exposure can be focused, but it is slower and more
  expensive in PP. Existing casual exposure makes a push cheaper, so organic spread shapes choices
  without dictating them.
- **Granularity:** country-level only for Phase 0, including large countries as single nodes.
  Sub-national regions are a possible later addition. Microstates use map markers.

**PP Income:** Two streams.

- **Base income:** earned every quarter, scaled to the Fandom Score with diminishing returns (each
  additional fan is worth slightly less PP).
- **Moment bonuses:** one-time PP for story beats and milestones — e.g., first league forms in a
  country, a country reaches 1% hardcore, a championship final, overtaking a rival in a country it
  held. Growth is literally earned by story.
- **Presentation:** moment bonuses appear as clickable pickups on the map (Plague Inc-style), each
  tied to its story.
- **Snowball control:** the primary lever is costs rising with each PP tier ("growing pains");
  diminishing returns on base income is the secondary lever.
- **Banking:** PP can be saved without a cap. No upkeep costs in Phase 0 — focus slots already
  limit attention. Revisit if balance runs show hoarding is a dominant strategy.

**Story → Mechanics (Event System):**

- **Two event kinds, both built from recorded simulation facts** (conditions → text → effects),
  referencing the real teams, players, and outcomes involved. Text never invents results.
  - *Moments* report something that happened (a final, a breakout star, a fan milestone) and apply
    effects automatically, often with a PP pickup.
  - *Decisions* are choice cards with trade-offs (e.g., shorter halves: +casual reach, −purist
    goodwill).
- **Closed effect vocabulary (Phase 0):** temporary casual/hardcore conversion modifier in a
  country; spread channel boost; one-time fan shift between buckets; PP bonus; rival setback;
  hardcore demotion (scandals); league health nudge; club strength (flagship season cards only,
  added 2026-10-03). Content selects from this list and is
  validated at load. Effects are local and temporary by default; permanent effects are rare and
  clearly flagged.
- **Volume per turn:** moment count scales with turn length and number of active markets, so
  long late-game turns don't thin out. Decision cards are capped (~1–3 per turn, config).
  League management in active markets supplies additional per-turn activity, while global
  decisions stay macro.
- **Pickups:** clicking opens the story and collects the PP immediately; uncollected pickups
  auto-collect at end of turn. No lost rewards.
- **Moments have weight (decided 2026-10-05, v1.26).** A first thousand fans in a small country
  is not your Elite flagship's new star. Every moment card has a weight in content: *minor*,
  *big* or *headline*.
  - *Minor* moments stay toasts on the world map (collect with a click; Next Turn collects them).
  - *Big* moments get a window over the map styled as a back page: date line, large headline,
    the story, the reward and a Collect button, with a pulsing ring on the country.
  - *Headline* moments get a front page: the map dims behind it, the sport's emblem and colours
    frame it, and the country bursts when it is collected.
  - *The flagship scales with its tier.* A big flagship moment (the champion, a star breaking
    out) becomes a headline when the flagship is Professional or Elite (config). The sport's
    first-ever star is always a headline.
  - *Card families look different* so the news has variety: season cards read as the sports
    page, star cards as a player profile, tradition cards as heritage, rival cards as world news,
    the rest as the sport's own paper.
  - *Order:* after Next Turn, big and headline moments come first, in the order they happened
    (the champion and a new star explain the season's decision cards), then decisions, then
    minor toasts.
  - *Big moments cannot be skipped (choose pain on attention).* They have no dismiss; Next Turn
    stays locked until each is collected. Only minor moments are collected by Next Turn.
  - *Built later (v1.32):* minor moments collect themselves (an option, on by default).
- **Negative events** (scandals, star injuries, rival coups) occur throughout and grow more
  frequent at higher PP tiers, reinforcing growing pains and feeding late-game pressure.
- **The flagship season as cards (decided 2026-10-03).** The flagship's results reach the
  player through the event system, built only from the recorded season summary.
  - *A champion moment every season.* It names the champion and runner-up and carries a PP
    pickup scaled by the flagship's league tier (config). It always appears and never takes a
    moment slot.
  - *At most one story card per season,* chosen by priority from a short list of recorded
    facts: a dynasty (the same club's third straight title or more), an underdog champion (among
    the weakest-rated clubs when the season began), a club's first title, a close finish (a small
    points gap, or a final decided by the narrowest margin) and a repeat final (the same two
    clubs again). One story a season keeps dynasties rare and memorable.
  - *Story cards are decisions with trade-offs,* e.g. a dynasty: celebrate it (more hardcore
    fans at home, but casual fans tire of a foregone result) or level the field (costs PP, weakens
    the champion, its fans resent it).
  - *Some season facts are pressure cards (choose pain).* A runaway champion (a huge points gap)
    or a fourth straight title drains casual fans in the flagship country unless the player pays
    to answer it.
  - *One new effect: club strength (`clubRating`).* It moves the champion's rating, or the rest
    of the field's, by config steps. It is valid only on flagship season cards (validated at
    load) and is the player's first lever on competitive balance.
  - *Effects stay in the flagship country,* like every other card. How the flagship feeds global
    spread is designed separately, not decided by a card (see The flagship's broadcast, v1.23).
  - *Caps:* the story card counts against the per-turn decision cap but is offered first in the
    turn it arrives.
  - *Pressure lands when the card appears (choose pain).* The casual drain applies at once;
    paying adds a fix (rating changes) but never cancels the drain.
  - *Priority when several facts qualify:* pressure first, then the rarest story — foregone
    league or runaway, dynasty, repeat final, underdog, first title, close finish. No randomness.
  - *Cooldowns count in seasons, not turns,* because turn length changes with the PP tier. Close
    finish and first title wait 2 seasons; the rarer facts need none.
  - *American format:* runaway fires only when the playoff champion also topped the table by the
    gap; a table leader beaten in the playoffs is no runaway story.
  - *Starting card list (every number is config and tuned by the runner; each decision also has
    the free hold choice):*

    | Card | Fact | Choices (PP) and effects in the flagship country |
    |---|---|---|
    | Champion (moment) | Every season end | PP by tier: Amateur 4, Semi-Pro 6, Professional 10, Elite 15 |
    | Dynasty | A club's third straight title | Celebrate (0): hardcore ×1.25, casual ×0.85, 4 quarters. Level the field (10): champion −2 rating steps, 1% hardcore demote |
    | Underdog | Champion in the bottom third by rating at season start | Ride the story (6): casual ×1.3, 4 quarters. Build on it (0): champion +1 step |
    | First title | A club's first title | New fans (5): casual ×1.25, 4 quarters. Old guard (0): hardcore ×1.15, 4 quarters |
    | Close finish | Gap of one win or less, or a final won by the narrowest margin | Market it (8): media spread ×1.4, 8 quarters. Bank the gate (0): +8 PP, casual ×0.9, 4 quarters |
    | Repeat final | The same two clubs in the final (or first and second) two seasons running | Stoke it (0): hardcore ×1.2, league health −1 step. Cool it (6): no effect. Seeds the derby tradition later |
    | Runaway (pressure) | Champion tops the table by a large gap | On arrival: casual ×0.8, 4 quarters. Revenue sharing (12): the rest of the field +1 step |
    | Foregone league (pressure) | A fourth straight title or more (replaces dynasty) | On arrival: casual ×0.8, 4 quarters. Draft lottery (12): champion −2 steps, the field +1 |

  - *Bots* answer every season card by their own weights, and the win contest is remeasured once
    the cards are built.

- **The flagship's broadcast (decided 2026-10-05, GDD v1.23).** How the flagship feeds the
  global map without competing with it. Before this, only backed stars and famous grounds linked
  the flagship to spread; a flagship with no backed star did nothing for the world. Every number
  is config.
  - *The flagship broadcasts on its own, and the audience is earned (choose pain).* While a
    league holds the seat, media reach where it airs is multiplied by (1 + ceiling ×
    interest × health). The ceiling rises with the league's tier (e.g. Amateur 0.05, Semi-Pro
    0.1, Professional 0.25, Elite 0.4), so the long Amateur stretch barely carries abroad.
  - *Interest comes from the last finished season's recorded facts.* A gripping season (a close
    finish, a first title, an underdog champion) earns the full ceiling; an ordinary season earns
    part of it (e.g. 0.7); a dynasty less (e.g. 0.5), a runaway or a foregone league little (e.g.
    0.25). It is read from the season summary with the story thresholds already in config, so
    the `clubRating` cards, the one lever on competitive balance, now matter on the world map.
    A newly seated flagship with no finished season counts as ordinary.
  - *Health scales it.* Healthy 1, Struggling 0.5, Near-Collapse 0.
  - *Big seasons send a pulse.* At a season's end, media reach where the league airs gets an
    extra temporary boost (e.g. the tier's ceiling × 1, fading over 4 quarters). Gripping seasons
    pulse larger (e.g. ×1.5); runaway and foregone seasons send no pulse.
  - *The reach follows the seat country's media reach links (revised 2026-10-05, v1.27).* Where
    the seat's media reaches, the broadcast and the pulse multiply *all* media reach into that
    market, from every source, scaled by the market's link from the seat relative to the
    strongest: (1 + (ceiling × interest × health + pulse) × link ÷ strongest). Large media
    markets and countries sharing the seat's media sphere hear the most. Where the seat sits is a
    geographic choice, not only a tier choice: a seat in a small media market reaches nowhere.
    Rival broadcast deals still block the channel. *Why revised:* as first written (v1.23) the
    broadcast multiplied only the seat country's own outbound media, so its weight followed the
    seat country's share of the sport's world fans; built and measured, it was 0–5% of world
    media exposure and fell to about 0.1% by tiers 4–5, even at Elite after a gripping season.
  - *Troubles ripple out (choose pain).* While the flagship is at Near-Collapse, the countries its
    media reach lands in lose a small share of the player's casual fans each quarter (e.g. 0.5%),
    scaled by each country's link from the seat relative to the strongest; the seat country
    itself already pays through its own league. Hardcore fans are never touched.
  - *It stacks with backed stars:* backed stars lift media out of the seat country, the broadcast
    lifts media into the markets it reaches; both apply. Only the league holding the
    seat broadcasts; the broadcast moves with the seat.
  - *Guard (the map stays the game).* A balance target keeps the flagship's share of the
    player's world media reach exposure modest (e.g. 5–15%), reported by the runner. The win
    contest is remeasured once; if "#1 lost before the win" falls well below half, the flagship
    numbers are cut rather than rivals strengthened.
  - *On screen:* the map tooltip names a "Flagship broadcast" line where it reaches, and the
    flagship screen shows the season's interest as a word with the health effect. No new map lens.
  - *Talent pull is separate (parked):* see the parking lot.

**PP Growth Tree:**
- **Structure:** a small branching tree per category (~8–12 nodes each) with prerequisites inside
  the category. Phase 0 builds Grassroots and Media only (~15–20 nodes).
- **Closed effect vocabulary:** spread channel strength, casual conversion, hardcore conversion,
  churn reduction, league formation threshold, cold-launch cost, PP income, cash opportunity
  unlocks, running cost reduction, backlash resistance, rival countermove resistance. Validated at
  load.
- **Global but conditional.** Every node applies worldwide, but many are conditioned on country
  attributes (e.g., "Street courts: +casual conversion in dense, lower-income countries"), so
  builds synergize with the genome and target map.
- **Category roles:**

| Category | Unlocks at tier | Role |
|---|---|---|
| Grassroots | 1 | Proximity spread, casual conversion, league formation, churn |
| Media | 2 | Media reach and language channels, casual reach, TV cash unlocks |
| Infrastructure | 3 | Hardcore conversion (venues, academies), running costs, promotion eligibility |
| Culture | 4 | Nurturing traditions (v1.12): strengthen, spread and protect traditions that have emerged; culture itself is never bought (see Culture) |
| Global | 5 | Cold launches, rival defense budget reduction, flagship bonuses, holding #1 |

- **Exclusive forks:** 1–2 per category; choosing one locks out the other (e.g., Pay-TV exclusivity:
  +cash, −casual reach vs. Free-to-air: +casual reach, −cash).
- **No refunds.** Purchased nodes are permanent — choices must hurt.
- **Cost (revised v1.34):** PP income per quarter × the node's quarters of income, rising a
  config share for every node owned (see Second playtest follow-ups). The tier multiplier and the
  v1.9 size factor below no longer apply to PP prices.
- **Prices grow with the sport (decided 2026-09-19).** A node's price also scales with the sport's
  own Fandom Score, so the tree is never bought out: a campaign ends owning about half of it, and
  which half is the decision. Before this, PP income grew with the sport while prices did not, so
  every campaign owned every reachable node by the middle of the game and the forks resolved the
  same way — the tree was a formality. The scaling is deliberately steeper than the income curve, so
  each node is dearer than the last and waiting costs you. Tuning (2026-09-19): a campaign owns a
  median 9 of the 16 reachable nodes, and different strategies own different ones — the grassroots
  spine, the media branch, opposite fork sides.
- **Buying rules (decided 2026-09-13):** a category can be bought from only while the sport's
  *current* PP tier unlocks it. After a demotion the sport keeps every node but cannot buy from a
  category above its current tier until it climbs back. The multiplier is the highest tier reached.
- **How effects apply (decided 2026-09-13):** each effect acts in the country where it lands (the
  target country for spread and cold launches, the league's country for running costs). A condition
  on country attributes can shrink an effect to nothing but never turns a bonus into a penalty;
  penalties exist only as a fork's explicit downside. Cold-launch nodes cut only the cold-launch
  surcharge. PP income nodes pay according to where the player's fans are. Countermove resistance
  shrinks every rival countermove's effect on the player in that country. Stacked effects have a
  floor, so nothing becomes free.
- **Phase 0 vocabulary:** the build applies spread channel strength, casual conversion, hardcore
  conversion, churn reduction, league formation threshold, cold-launch cost, PP income, running cost
  reduction and rival countermove resistance. Cash opportunity unlocks and backlash resistance are
  rejected at load until the systems they act on exist.
- **Phase 0 node list (decided 2026-09-13).** Twenty nodes, four forks (a fork's sides lock each
  other out). Numbers are tuning and live in `content/growth-tree.yaml`.

| Category | Node | Needs | Effects |
|---|---|---|---|
| Grassroots | Backyard Clinics | — | + casual conversion |
| Grassroots | Word of Mouth | Backyard Clinics | + proximity spread |
| Grassroots | Weekend Leagues | Backyard Clinics | − league formation threshold |
| Grassroots | **Street Courts** (fork: where to play) | Backyard Clinics | ++ casual conversion in dense, lower-income countries; − hardcore conversion |
| Grassroots | **Club Grounds** (fork: where to play) | Backyard Clinics | + hardcore conversion (more in wealthy countries), − churn; − casual conversion in poorer countries |
| Grassroots | Fan Meetups | Word of Mouth | − churn |
| Grassroots | Volunteer Organisers | Weekend Leagues | − running cost (more in lower-income countries) |
| Grassroots | Border Tournaments | Word of Mouth | ++ proximity spread; − cold-launch cost |
| Grassroots | **Community Ownership** (fork: roots) | Fan Meetups + Volunteer Organisers | − churn; + countermove resistance; + cold-launch cost |
| Grassroots | **Barnstorming Tours** (fork: roots) | Fan Meetups + Volunteer Organisers | −− cold-launch cost; − formation threshold; + churn |
| Media | Local Radio | — | + language spread |
| Media | Newspaper Columns | Local Radio | + casual conversion (more in wealthy countries) |
| Media | Highlight Reels | Local Radio | ++ media reach spread |
| Media | Dubbed Broadcasts | Local Radio | ++ language spread; − cold-launch cost |
| Media | **Pay-TV Exclusivity** (fork: TV deal) | Highlight Reels | − running cost (more in large media markets); − casual conversion |
| Media | **Free-to-Air** (fork: TV deal) | Highlight Reels | + casual conversion (more in large media markets), + media reach; + running cost |
| Media | Star Profiles | Newspaper Columns | + hardcore conversion; − churn |
| Media | **Sponsor Showcase** (fork: coverage) | Star Profiles | ++ countermove resistance, + PP income; − casual conversion |
| Media | **Tabloid Buzz** (fork: coverage) | Star Profiles | ++ casual conversion (more in dense countries); + churn |
| Media | Satellite Feed | Highlight Reels + Dubbed Broadcasts | +++ media reach spread; + PP income |

**World Championship & National Teams (Phase 2):**
- **Founding:** the player founds and names the World Championship (default name provided) once
  enough countries have leagues. Held every 4 years. The multi-sport Games route is not used.
- **Effects:** a casual conversion burst in every participating country plus PP pickups.
  **Hosting:** countries bid in the offseason and the player picks the host, which gains a
  large hardcore conversion and cash boost — a strategic tool for cracking a target market.
- **Field:** countries with a league at Semi-Pro or above, plus the host; 16 or 32 teams depending
  on eligibility; seeded by strength. No qualification simulation.
- **National team strength:** built from the best players of that nationality wherever they play
  club football — a country without a pro league can field a strong team from stars abroad.
- **Upsets:** matches are simulated with genuine upset chances; an underdog's deep run gives a
  large boost in that country ("Tuvalu reaches the semifinal").

**Hall of Fame:** Annual classes selected automatically from retained records (career thresholds in
config). Wings: players, league directors, founding-family members, and a Moments wing for landmark
events. Each induction is a 9x16 key moment. Mechanical effect: each inductee adds permanent
hardcore stickiness in their home country.

**What the sport remembers, topic 1: the Hall of Fame (decided 2026-10-07, v1.31).** The
lightweight build. Every number is config (`hallOfFame`).
- *Wings:* Players and Moments. League directors and founding-family members wait until those
  people exist (parking lot).
- *Players are inducted on points from retained records only:* star seasons, titles won while at
  the club, seasons as the league's top scorer (the stand-in for awards until Player of the Season
  exists) and holding the all-time scoring record. A player is eligible a few seasons after
  retiring (e.g. 2). Those above a points bar go in best first, at most a few a class (e.g. 2);
  the rest wait for a later class and are never dropped. Backing and honors add nothing: fame
  comes only from facts (choose pain: inductions are late and scarce).
- *The Moments wing* inducts a closed content list of firsts, each once: e.g. the founding club's
  first title, the first star, the first Professional and Elite seasons, the first record crowd,
  first taking #1, the win. At most one per class, oldest first.
- *Effect: permanent shrine weight.* Each player inductee adds a small fixed amount (e.g. 0.1) to
  their home country's tradition weight. It never decays and cannot be betrayed, but it counts
  inside the weight cap (a country already full of traditions gains nothing) and, being weight,
  raises the cost of moving the seat away from that country. Induction renews the inductee's
  living star legacy. The Moments wing has no mechanical effect beyond its card's PP.
- *Classes:* one a season, when the offseason opens, after the champion card. An empty class shows
  nothing.
- *Where it lives:* a new **Almanac** tab: the Hall of Fame (two wings; each plaque quotes its
  recorded facts) and Records (the roll of champions by season, all-time top scorers, the record
  crowd). It is the future home of other kept history, such as all-time stats leaderboards, the
  heatmap timelapse and history charts. Traditions stay on the Rulebook.

**What the sport remembers, topic 2: chants and anthems (decided 2026-10-07, v1.31).** Every
number is config (`culture.chant`).
- *A new tradition type, `chant`, held by one club.* Derby (a pair rivalry) and club rite (the
  founding ritual) are unchanged; a chant is any club's terrace song. The first chant ever born is
  *the anthem*: it starts stronger, and there is only ever one. A club holds at most one living
  chant; the founding club can hold its rite and a chant.
- *Birth:* a title that is dramatic and rare: an underdog title (the season stories' underdog
  rule), or a club's first title won in a close finish. A plain close finish is too common to
  count. The birthplace sets an ease for the type, balanced with the rest. Many campaigns go
  decades without one (choose pain). *Call made at build:* a first title counts only once the
  league has played 10 seasons, since a young league's titles are all firsts (without it every
  campaign had a chant in its first seasons).
- *It spreads with its fans (its distinct feature).* Once a year a chant at high strength may gain
  one follower: a country linked to a follower by proximity or language where the player's
  hardcore share is above the reach floor. The chance works without Culture nodes; reach nodes add
  to it. At most a few followers (e.g. 4), held abroad at the usual follower share. It is the only
  tradition that carries stickiness abroad without nodes.
- *Renewal, decay and loss:* the club's titles renew it; it decays without them and is lost when
  the club folds. A follower abroad is dropped when the player's hardcore share there falls below
  the floor: the fans who sang it are gone.
- *What it constrains:* amendments offend it like every tradition, and modernizing a ground
  (venue levels 4–5) betrays the chants of that country's clubs as it does famous venues: seated
  stands kill the singing end.
- *Cards:* a birth moment with PP by type; the anthem's birth is a headline. A chant's first
  follower abroad is a minor moment; later spreads are silent.

**What the sport remembers, topic 3: the gear brand (decided 2026-10-07, v1.31).** The homegrown
gear brand is **not** a tradition. It stays what deals built (v1.28): a demand-free main-sponsor
option at a share of value with a bigger loyalty edge, offered every offseason. This replaces the
v1.12 artifact rule that it appears once a country's hardcore base is large enough.

**What the sport remembers, topic 4: presentation and saves (decided 2026-10-07, v1.31).**
- *The induction card:* one card per class, taking no moment slot, after the champion card. It
  names every inductee and quotes their recorded facts. A big moment; the sport's first class, and
  any class inducting the all-time scoring record holder, is a headline. PP per inductee by wing
  (config), scaled by the flagship's tier as the champion card is.
- *Chant cards* reuse the tradition birth and loss cards with chant wording (a moment slot, as
  other types). The anthem's birth is a headline; a chant's first follower abroad is a minor toast.
- *Save format 23* adds the Hall of Fame. Format 22 migrates with an empty Hall and no
  retroactive inductions: only players retiring after the migration become eligible, Moments firsts
  count only from landmarks recorded after it, and chants are born only from seasons ending after it.
- *The Almanac* shows the plaques, a Waiting list (eligible players not yet inducted, and retired
  players still within their waiting seasons, by facts, never points) and Records (the roll of
  champions by season with top scorer and crowd, the all-time top ten scorers, the record crowd).
  Plaques link to their country.
- *Shrine weight on the map:* the country card lists the Hall of Fame's inductees from there in
  words, beside its traditions; the map's tradition marker counts shrine weight too.

**What the sport remembers, built 2026-10-07 (calls made at build).** The player bar is 20 points
(at 12 nearly every retired star got in); a never-a-star player can still get in on titles and
top-scorer seasons, and the card says so. Measured (builder, 12 typical anchors, seeds 1–3, 200
turns): pacing passes and barely moves (first win median 158, was 161); #1 lost before the win
53% (was 56%); 16–18 player inductees a campaign, the first around turn 35–44; the anchor's shrine
weight reaches the cap by the end, where traditions already hold it; 6–7 chants a campaign, most
fading when their club stops winning. Bots still never buy Culture nodes (watch item).

**Playtest follow-ups (decided 2026-10-07, v1.32).** A 133-turn playtest through the app (Austria)
found the late game noisy and its rewards weightless. Every number is config.
- *No worthless deal offers.* An offer (renewals and the gear brand included) is made only if it is
  worth at least a minimum a season (`flagship.deals.minOfferValue`); a slot with none stays empty.
  Small leagues' naming rights were worth hundredths and one still demanded a seat lock.
- *Minor news collects itself.* Minor moments are collected automatically as they arrive (an
  option, on by default), with one short line saying how many and the PP; the journal keeps every
  card. This replaces the parked auto-collect item. The playtest saw 213 "A following of your own"
  toasts.
- *Front pages for rare stories only.* At the headline tiers the champion card is a front page
  only when its season tells a rare story (a first title, an underdog title, a dynasty, a foregone
  league); star cards keep only the first star's front page. A Hall of Fame class is a front page
  only if it is the first class or inducts the current all-time scoring record holder. (The
  playtest had 62 champion front pages in 75 seasons and 7 of 13 classes.)
- *Firsts with scale.* The first record crowd counts for the Hall of Fame only once that league has
  turned Professional (it was inducted from season 2 at a league of 239 hardcore fans).
- *Card PP stays as it was (decided, built, measured and reverted 2026-10-08).* Scaling card PP
  like node prices made bots buy out the tree and never lose #1 before the win (0/36 campaigns;
  half the size factor 25%, tier only 39%, against 53% before). Late in a campaign PP is not
  scarce, so a PP reward big enough to matter buys the rest of the tree. Rewards stay unscaled and
  choice costs scale by the tier multiplier, as before; late rewards in what is scarce late are
  parked.
- *The offseason shows last season's scores* on the flagship until the new season starts.

**Awards:** Player of the Season per league and a global Player of the Year. Mostly flavor — they
feed Hall of Fame eligibility, raise star power (affecting transfers toward the flagship), and name
names in stories.

**Awards and press, topic 1: awards (decided 2026-10-08, v1.33).** Every number is config
(`awards`).
- *Which awards:* the flagship's Player of the Season, and the season's top scorer as a named
  prize (in the sport's terms). Only the flagship has named players, so Player of the Year waits
  for named standouts in other leagues (parking lot).
- *Player of the Season* is chosen from the season's record: points for scores, a bonus for the
  club's finish (champion, runner-up) and points for playoff and final scores (config weights);
  ties go to fewer matches, then the lower id. It often differs from the top scorer. Star-making
  is unchanged: an award makes no star.
- *What awards do:* flavor and the Hall of Fame. Each Player of the Season award earns Hall points
  (config); the top scorer's points stay, under the prize's name. Awards name names on cards and in
  the Almanac. Star power toward the flagship waits for the parked talent pull; no other effect.
- *The name comes from the records:* "Player of the Season" until the Hall of Fame inducts its
  first player, then named after them (e.g. "the Huber Medal"), fixed once given (choose pain: no
  renaming).
- *How it reaches the player:* lines, not cards: the champion card and the season in review name
  the winner; the Almanac's roll of champions shows them, plaques count awards, the Stars panel
  shows a star's awards. The first award ever is a minor toast; no other new moment.

**Awards and press, topic 2: press (decided 2026-10-08, v1.33).** Presentation only.
- *Outlets:* one invented outlet per country, named from content: its biggest real place
  (`places.yaml`) and a sports-paper word from a list in the names file ("The Graz Matchday",
  "The Lagos Terrace Post"); sports words keep clear of real newspapers. A moment's masthead is
  its country's outlet, with the card family as its section ("The Graz Matchday · Sports Page").
  Rival world championships run on one invented international wire.
- *A country gets its press when its league forms;* until then its stories run in the sport's own
  paper ("The {sport} Gazette").
- *Headline variety:* 2–3 title variants for the frequent cards (champion, star breakout,
  tradition birth, league formed, promotion), picked by a stable hash of the event so a card never
  changes on reload. Bodies unchanged; a variant claims only what the card's facts show; English
  only.
- *The season's front page:* the offseason's "season in review" becomes the seat outlet's front
  page: the champion as the lead story (headlined when the season tells a rare story), and short
  items from the season's record: Player of the Season, the top scorer's prize, a new star, a
  record crowd, traditions born, a Hall of Fame class. Laid out to film in 9x16; not a new popup.
- *Limits:* no press sentiment; outlets never change a number; no headline claims an unrecorded
  fact. Outlets are derived from content and the league record, never saved.

**Awards and press, topic 3: presentation and saves (decided 2026-10-08, v1.33).**
- *Saves:* each season summary stores its Player of the Season (so changed weights never rewrite
  history), and the champion card's season facts name them. Save format 24; format 23 migrates
  with no winner for past seasons: awards start at the next season's end (no retroactive awards,
  as with the Hall of Fame).
- *The top scorer's prize* is "the {Score} Crown" in the sport's own term ("the Goal Crown", "the
  Run Crown").
- *Starting numbers:* Player of the Season points: 1 per score, +10 for a champion's player, +5 for
  a runner-up's, +1 more per playoff score and +2 more per final score. In the Hall of Fame each
  Player of the Season award is worth 3 points (as a star season) and the top scorer's prize stays
  2; the bar stays 20 and is raised if classes swell, rather than cutting award points.
- *The Almanac:* the roll of champions names each season's Player of the Season, plaques count a
  player's awards, and Records gain "Most Player of the Season awards" (top 5).
- *Built 2026-10-08 (calls made at build).* Award points swelled the Hall from 16–19 players a
  campaign to 20–24, so the bar rose from 20 to 24 (17–20). Pacing and the #1 contest (53%) are
  unchanged. A player's medal takes the family name, the last word of the recorded name.

**Second playtest follow-ups (decided 2026-10-08, v1.34).** A 101-turn playtest save (United
States, Hurlball, tier 5 on turn 96, #1 on turn 100) reviewed headlessly, then the player's notes.
- *Topic A, PP prices in quarters of income.* The playtest never bought a Media node: node prices
  grew with the sport faster than income (size ^0.6 against income ^0.5) and were multiplied by up
  to ×6 by tier, so the cheapest Media node cost about 30 turns of income at tier 5 (35 at tier 4)
  and 152k PP sat unspent, while a focus slot cost 36 PP. This supersedes the v1.9 size factor and
  the tier multiplier on PP prices.
  - *Price = PP income per quarter × quarters of income.* Every PP price is the sport's current
    base PP income per quarter times a number of quarters set in content, so a price takes the
    same time to earn at any size and the UI can say it in turns. This covers growth nodes, focus
    slots, star backing, rule amendments, bailouts and card choice costs.
  - *Node pacing:* Grassroots 3–6 quarters, Media 6–12, Culture 10–16; deeper nodes in a branch sit
    at the top of their range. At tier 5 (a year a turn) a Media or Culture node is about 1.5–4
    turns.
  - *The tree stays a choice (choose pain):* every node owned raises the next node's price by a
    config share, 5% to start (`growthTree.costScaling`).
  - *No tier multiplier on PP prices.* Longer turns and the per-node rise do that job; the tier
    still sets turn length, focus and backing slots and media revenue.
  - *Measured:* a pacing target for nodes owned when each tier is reached (`balanceTargets`), read
    by the runner and the pacing experiment. Saves need no migration: prices are computed live.
  - *Built 2026-10-08 (calls made at build).* A price floor of 10 PP a quarter keeps early prices
    where they were. Card choice costs became quarters (old PP ÷ 10). The rise per node compounds.
    Pacing passes at every tier; #1 is lost before the win in 78% of campaigns (was 53%), and the
    builder bot reaches each tier with fewer nodes than the starting targets (open questions).
- *Topic B, money in dollars (decided 2026-10-08).* The playtest saw a $3 TV deal and a
  1,700 sponsorship beside an Elite league of 50M fans: cash had no unit and showed the sim's raw
  numbers, and deals were the wrong size against revenue (the main sponsor about 3% of revenue,
  each naming-rights deal about 1%, against under 1% and about 0.1% in real top leagues).
  - *US dollars everywhere,* shown compactly ($4.2K, $310M, $12.4B).
  - *One conversion, the sim unchanged:* config `dollarsPerCash` turns the sim's cash into dollars
    for display, calibrated so a US-scale Elite flagship earns in the NFL's range. Deal and revenue
    rates are then retuned so the revenue mix and deal sizes match the benchmarks. Converting the
    sim itself to dollars is parked.
  - *Benchmarks:* a sourced table of real leagues by tier (Amateur local leagues, Semi-pro
    USL/National League class, Professional MLS class, Elite NFL/Premier League class): annual
    revenue, the mix (media, sponsors, gate) and top sponsor and naming-rights deals as shares of
    revenue. It lives in the docs and in `balanceTargets.money`; the runner reports against it.
    The table is shown to the designer before tuning.
  - *Floor:* no offer below $10,000 a season (config, in dollars); smaller leagues get none.
- *Topic C, rival TV lockouts (decided 2026-10-08).* A rival's broadcast deal countermove removed
  every TV offer at the seat for 16 quarters, twice, unexplained.
  - *It cuts, never blocks:* while it runs at the seat, TV offers are fewer and smaller by a config
    share (50% to start); a TV deal already signed is untouched. Its media reach block stays.
  - *The player is told:* a rival countermove landing at the seat is a big moment ("Soccer's
    broadcaster locks up the US airwaves until 2031"), and the deals panel's TV slot names the
    rival, the cut and the end date.
- *Topic D, attendance and max capacity (decided 2026-10-08).* The offseason said a level 1 venue
  "seats 3.4M hardcore fans": the venue's capacity is a league-wide share of the population, shown
  as seats.
  - *The sim is unchanged:* capacity still caps the seat's gate and fades the conversion lift when
    fans overflow. Raising it means modernizing, which tears down old grounds and betrays the famous
    ones; that is the intended cost and the screen says so plainly.
  - *Named as what it is:* the screen calls it **Attendance** and **Max capacity**. Each club's
    ground has a size by venue level (config: 3,000 / 12,000 / 30,000 / 55,000 / 80,000), a match's
    crowd is its ground filled to a share, and season attendance is clubs × home games × crowd. The
    cap is a line in fans: "1.2M hardcore fans can't get tickets."
  - *Record crowd:* the biggest single-match crowd (the final, or the champion's best gate); it is
    still set when the seated crowd beats the record.
- *Topic E, realistic scorelines (decided 2026-10-08).* "High" scoring gave about 4 a side, barely
  above medium (about 2): the chosen scoring rule did not show in the score.
  - *The match engine is refitted* so each scoring rule plays realistic totals while the stronger
    club wins, draws and upsets stay at today's fitted odds: per side about 1.5 (low, soccer and
    hockey), 20 (medium, rugby and American football) and 90 (high, basketball), in config.
  - *Everything counted in scores is normalized* by the rule's average: top scorer tallies, the
    scoring record, Player of the Season and Hall of Fame points, the star threshold and the close
    final margin, so a high-scoring sport does not flood the Hall or the awards.
  - *Term values parked:* scores worth different points by the sport's term (a try 5, a kick 3).
- *Topic F, press goes digital (decided 2026-10-08).* Outlets were a place plus a British
  football word ("New York City Kickabout") and every big story was a newspaper page; the champion
  front page then came back as the offseason's season in review.
  - *The look matches the moment's weight:* minor = a phone push notification or social post, big =
    a news-site article, headline = a breaking-news banner or a site's lead story. Print survives
    only as rare flavor (an old clipping in the Almanac). This supersedes v1.33's mastheads and
    front pages.
  - *Outlet names:* place + a modern, neutral word (Sports Desk, Live, Daily, Insider, Report,
    Network, Pulse, Now): "Houston Sports Desk". Pools by language sphere are parked.
  - *One headline, one recap:* the champion moment keeps the headline look; the offseason's season
    in review becomes a stats recap (final standings, the playoff path, awards, records, traditions
    born, a Hall class), not a second front page.
- *No Britishisms by default (decided 2026-10-08).* Default English is neutral international, not
  British: no "matchday", "fixture list", "terrace", "kickabout" as defaults in strings, names or
  content. Local flavor belongs to the country it fits (British words for British markets).
- *Topic G, a leagues overview with bulk promotion (decided 2026-10-08).* Promotion was one click
  per country across 200+ leagues. A leagues overview lists every league with tier, health, cash
  and eligibility, sortable; at its top "Promote all eligible" by target tier ("Promote 14 leagues
  to Semi-Pro") confirms with the list and each league's cash. Each league still pays its own
  cash; the flagship is excluded (its promotion needs a venue and is the seat's decision).
- *Topic H, firsts on time (decided 2026-10-08).* "A following of your own" cards arrived about 45
  turns late, for countries already at 15–38%: they waited behind higher-priority cards for the six
  moment slots. "First following" and "league arrival" no longer take moment slots (like deal
  news), stay minor and collect themselves, and are skipped when stale: the country is already past
  a config share (2% to start) or the fact is more than a config number of turns old.
  - *Built 2026-10-08 (call made at build):* no turn limit was needed. League arrival reads its
    fact only in the turn it happens, so a full turn dropped it (156 of 213 told), never delayed it.
- *Saves:* nobody plays but the designer, so these changes need no save migrations (2026-10-08).

**Press coverage:** Presentation only; no press sentiment system. Fictional outlets per country
(in the names data file); headlines built from record-backed Moments, with English-only flavor
variety. Big turns can show a newspaper-style front page in the recap (a 9x16 candidate).

**Culture (decided 2026-09-26, GDD v1.12):** Culture is not bought. It emerges as **traditions**
born from recorded simulation facts, and shows up as how fans behave. Playtesting found no felt
culture; the lesson carried over from God of Sport's v1.9 review is that names, flavor text,
purchased traits and percentage modifiers alone do not make culture.
- **Traditions** are entities with stable IDs, a closed type vocabulary (validated at load, like
  growth effects), the facts that created them, and the countries whose fans hold them. Examples:
  a derby after repeated finals between two clubs, a style of play named after a local star, a
  national nickname for the sport, a rite from the founding club. Founding character (birthplace,
  ethos) biases which types form.
- **Traditions help and constrain (choose pain).** They make hardcore fans stickier where they are
  held (slower generational turnover, harder to poach). They also make those fans resist betrayal:
  rule changes that break them, deal demands that cheapen them, and moving the commissioner's seat
  away from them. Purist backlash reads traditions instead of an abstract cost.
- **Nurturing:** the growth tree's Culture category strengthens, spreads and protects traditions
  that already exist. It cannot create one.
- Stories and the Almanac may cite a tradition only through the facts that made it.
- **Artifacts are traditions that are things** (decided 2026-09-26): the same entity model and the
  same help-and-constrain rule, not a separate system. First build: famous venues, the flagship
  trophy, and chants and anthems (the homegrown gear brand stays a deal partner, v1.31). Films and
  books come later, as flavor.
  - *Famous venues* are earned, never bought: the player buys capacity (the 1–5 level), but fame
    comes from facts (hosting finals, record crowds, a legendary match). The founding club's
    ground is the first, named at creation with founding character. A famous venue makes nearby
    hardcore fans stickier, draws a small casual pull from abroad (pilgrimage) and raises the
    flagship's big moments. Its fans resist naming-rights sales, relocation or modernization, and
    moving the final elsewhere, so a naming-rights deal on a famous ground is a real dilemma. It
    can be lost (club folds, league collapses, ground sold), which is a lasting landmark.
  - *The trophy* is named after a founder or star; fans resist renaming it.
  - *Chants and anthems* are born at big moments and spread with the fans who hold them.
  - *A homegrown gear brand* is a sponsor option at the flagship: loyal and demand-free, but
    smaller than outside sponsors. It is not a tradition (v1.31); it is always offered.
  - *Fame comes only from facts.* The player can build capacity, name the trophy, and nurture an
    existing artifact through the Culture category, but cannot buy fame.
- **Culture, first build (decided 2026-10-04, v1.22).** Every number is config (`culture`).
  - *Scope.* Six types: four traditions born from facts (*derby*, *club rite*, *star legacy*,
    *national name*) and two artifacts (*famous venue*, *the trophy*). Chants and anthems come
    later (they overlap derby and rite); the homegrown gear brand comes with deals, since it is a
    sponsor option. Betrayal through deals (naming rights on a famous ground, demands that cheapen
    a tradition) is recorded as a hook and built with the deals system; the first build's
    betrayals are rule changes, the seat move and renaming the trophy.
  - *Births (fame comes only from facts).*
    - *Derby:* the same two clubs finish first and second, or meet in the final, in 3 of 5
      seasons. Answering "Stoke it" on the repeat-final card counts as one extra meeting; it
      advances a derby but cannot make one without the facts. Renewed by another such meeting.
    - *Club rite:* the founding club's first title. A founding club that never wins has no rite
      (choose pain). Renewed by its titles. Named from a pool keyed by birthplace.
    - *Star legacy:* a star retires after at least 4 star seasons or holding the all-time scoring
      record; retiring with honors starts it stronger. Named after the star ("the Okafor style").
      Renewed when a star of the same club breaks out.
    - *National name:* a country's league is first promoted to Professional (the anchor too). One
      per country, named from a pool keyed by language sphere; it never spreads. Renewed by the
      league's further promotions and each year it stays Professional or better.
    - *Famous venue:* every club has a ground, named from invented ground names in the names file
      with the club's real town. A ground becomes famous after a config count of fame facts:
      titles won by its club and finals hosted (American format, higher seed at home). The
      founding ground starts with one fact. Record crowds are fame facts from the venue build (v1.30).
    - *The trophy:* born at the flagship's first season end; the player names it on the champion
      card (default after the founding club or its ground). It belongs to the league that named
      it: when the seat moves, the new flagship names its own trophy at its first season's end,
      and the old trophy stays with its followers and fades without renewal. Renewed each season
      its league plays for it.
    - Followers start in the tradition's home country (the flagship's, or the league's for a
      national name) and spread abroad only through Culture nodes.
  - *Strength and loss (choose pain).* Each tradition has a strength from 0 to 1: born at a
    starting value, raised by each renewal fact, decaying each year without one. It is lost when
    its strength reaches zero, its source disappears (its club folds, its league collapses) or a
    betrayal breaks it. Every birth and every loss is a landmark.
  - *What they do.* A country's tradition weight is the sum of the strengths held there, capped
    (e.g. 2). Scaled by that weight: generational turnover of the player's hardcore fans is cut by
    up to a share (e.g. a third), and rival poaching and reclaim of them by up to a share (e.g.
    40%); world championships are unchanged. Only the famous venue has extras: a small casual pull
    into its country from countries where the player has fans (pilgrimage), and a multiplier on
    the champion moment's PP. Traditions help only the player's sport. Tuning keeps them felt
    without settling the #1 contest: if stickiness pushes "#1 lost before the win" well below
    half, the numbers are cut rather than rivals strengthened.
  - *Rival flavor traditions.* Rivals carry content-defined traditions (a famous ground, a
    trophy, a derby) as data in the same type vocabulary, with generic names in the names file so
    mods can rename them. Shown on the map and in tooltips; no mechanical effect; never born or
    lost in play.
  - *Betrayal.* Each tradition remembers the rulebook it was born under.
    - An amendment that moves a trait away from a tradition's rule offends it; a move back toward
      it does not. In each country, backlash × (1 + weight × the strength of the offended
      traditions held there); the anchor's ×2 stays as anchor resentment's stand-in and the cap
      stays. An offending amendment also cuts the tradition's strength by a share per jump; at zero
      it is broken (lost, with a landmark).
    - Moving the seat: the cost to the country left × (1 + weight × its tradition weight). Its
      flagship traditions stop renewing while its clubs are dormant, and renew again if the seat
      returns.
    - Renaming the trophy ends the old trophy tradition (landmark) and turns a share × its
      strength of hardcore fans in its follower countries casual; the new name starts a fresh
      trophy.
    - The amendment, seat move and rename reviews list the traditions offended and the hardcore
      fans their followers would lose.
  - *Founding character.* Birthplace sets per-type multipliers on birth thresholds and starting
    strength (e.g. factory and docks: derbies; village green: rite and trophy; schoolyard and
    beach: star legacy; barracks: rite and venue). Ethos sets multipliers on the three betrayals
    (e.g. gentleman's game: rules ×1.3, seat ×0.9; rebel game: rules ×0.7, seat ×1.3;
    working-class game: seat ×1.3, rename ×1.2; family game: rename ×1.3, rules ×0.9). Character
    shifts how easily a type is born, never creates one. Content validation keeps each
    birthplace's and ethos's multipliers near 1 on average (geometric mean within a config band):
    character changes a campaign's shape, not its difficulty. It belongs to the sport, so it
    applies in every country.
  - *What the player sees.* The map: a small pennant marker on countries holding traditions; the
    country card lists each one (name, type, strength bar, origin fact), rivals' flavor
    traditions under the rival. The Rulebook gains a Traditions section by type: name, born-on
    date and fact, followers, strength bar, the rule traits that would offend it; lost traditions
    greyed with their end date. The flagship screen tags derby pairings, famous grounds and the
    rite on club rows and names the trophy in the champions line. A birth moment for every new
    tradition (moment slot, PP by type) quoting its facts; a loss is a landmark and a moment.
    Strength shows as a bar, never a number; effects are described in words. The snapshot carries
    each tradition's id, type, name parts, origin facts, followers, strength, lost flag and
    offending traits; effect multipliers stay in the sim.
  - *The Culture growth category (tier 4; nurture, never create).* Four new effects in the closed
    vocabulary, each optionally limited to one tradition type: `traditionStrength` (slower decay,
    bigger renewals), `traditionReach` (followers spread), `traditionProtection` (less strength
    lost to offending amendments and seat moves) and `traditionHold` (bigger stickiness and
    resistance per unit of weight). Reach: once a year a tradition at full home strength may gain
    a follower country linked to a follower by a proximity or language channel with a player
    hardcore share above a floor, held at a share of home strength; with no reach nodes the
    chance is zero. About 8 nodes (Derby days, Club museum, Hall of legends, Supporters' trusts,
    Travelling support, Twinned towns, Heritage listing, Oral history) and one fork: *Heritage
    trust* (more protection and hold, but higher amendment backlash in tradition countries) or
    *Living game* (more reach and strength gain, less protection). Prices follow the other
    categories; bots get Culture weights and the options experiment checks no node dominates.
  - *Built 2026-10-04 (calls made at build).* Strength starts at 0.5, renews +0.25, decays 0.05 a
    year (a first try at 0.4 / 0.2 / 0.1 let legacies fade four years after retirement); most
    traditions live 10–30 years. The club rite is born once only (a later title cannot be a first
    title). Every club's ground is its town and a ground word. Hold raises weight for betrayal as
    well as for stickiness, so Heritage trust's higher backlash needs no separate effect. Reach may
    name a channel (Travelling support: borders and sea; Twinned towns: language). Losses by fold
    take every tradition at home in that league's country. National names arise in most markets
    as leagues professionalize, which is the decided rule; their effect is watched in the contest.
    Measured: pacing passes, #1 lost before the win 51% (36 of 70), differentiation 5 of 6 as
    invented, and with amendments the sports now stay distinct (purists defending traditions slow
    the drift toward the giants). Builder amendments fell from 3–4 to 1–2 a campaign.

**Stars (decided 2026-09-26, GDD v1.12):** Stars are how a league becomes a sport people love.
- **Where they come from:** the flagship carries full squads; every other league carries a few
  lightweight named standouts, created only when they are needed (God of Sport's lazy-athlete
  model). This answers where transfers toward the flagship and national-team players come from.
- **Faces of the sport:** the player backs a few stars as ambassadors; slots grow with PP tier
  (config). A backed star drives spread (media reach from their home country, casual conversion
  where they play) and is a common seed for traditions.
- **Commitment (from God of Sport's Champions):** a newly backed star grows into their influence
  over several seasons; dropping one loses that progress, and dropping a beloved one costs fan
  goodwill and can trigger a scandal. Relationships can end with honor: a promised final season,
  retiring with honors, or mentoring a successor. The game alerts the player when a succession
  decision is developing; there is no ritual reappointment.
- **Flagship stars (decided 2026-10-03, GDD v1.16).** The Phase 1 build of stars, small on
  purpose: a few stars per league, not a player database. Matches were club-level rolls in which
  nobody scored, so no recorded fact could make a star; the first step is recording who scores.
  - *One named leading player per club* (8–20 people at the flagship). They stand in for the
    "full squads" above until a later phase. Each is born in a real place of the flagship's
    country (`places.yaml`, weighted like clubs; no invented places, no foreign players in
    Phase 1), with a name from invented per-language-sphere pools in the names file (or a
    regional pool where a market's sphere does not match how its people are named, e.g. Nigeria
    in the English sphere; added 2026-10-03 at build), and a hidden skill that follows a career
    curve. The sport is a men's sport for now (decided 2026-10-03): every player, name pool and
    piece of text is men's. A women's version of a sport is a much later option (parking lot).
  - *A score is the sport's one scoring unit* (decided 2026-10-03): whatever adds to a match
    result, shown with the sport's own term once founding character is built and a neutral
    "score" until then. No score types and no assists; innings sports count runs the same way.
  - *The scoring frequency trait shapes matches* (decided 2026-10-03). Low, medium and high set
    a match's scoring chances (config, e.g. 3, 6 and 14), with the scoring rate tuned so the
    stronger club wins about as often in every sport. Low-scoring sports draw more and decide
    more finals by one score; season story thresholds are remeasured per frequency once.
  - *Who scored is recorded.* Each successful scoring chance is credited to the club's leading
    player with a config probability raised by their skill, otherwise to the squad. Each season
    records, per leading player: matches, scores, and scores in playoff matches and the final.
    The credit rolls use the flagship's own random stream, so the world never depends on them.
  - *A star is made by a season, and stars are scarce (choose pain).* At a season's end the top
    scorer becomes a star only if they scored at least a config share of their club's season
    total and the league has an open star place. The share is set per scoring frequency (built
    2026-10-03: a single 35% bar made stars more readily in low-scoring sports, whose shares
    swing more; the bars are tuned so stars arrive about equally often in every sport). A star stays a star until retirement, so new stars arrive mostly as old
    ones fade, and every new one is an event.
  - *Star places by league tier (config):* Amateur 1, Semi-Pro 2, Professional 3, Elite 4.
    Amateur gets one, not none: the seat spends its first ten or so seasons at Amateur, and the
    Phase 1 slice needs an emerging star inside that stretch.
  - *A leading player is generated* when a club is founded and when its leading player retires.
  - *Only recorded counts are cited.* Screens and stories quote tallies ("14 scores in 14
    matches, 40% of the club's total"), never invented match moments such as the minute of a
    winning score.
  - *What a star does (decided 2026-10-03).*
    - On the field (choose pain): a star adds strength to their club (config, scaled by skill)
      on top of the drifting club rating; leading players who are not stars add nothing beyond
      their scoring credit. Stars make strong clubs stronger, which feeds the runaway and
      foregone-league pressure cards.
    - Unbacked stars move fans only through the cards they raise (choose pain). A star the
      player ignores is a strong club, not a marketing asset.
    - A backed star raises casual conversion in the flagship country and strengthens the media
      reach channel out of the flagship country, both scaled by their influence, which grows
      over seasons (commitment). This is the flagship's first link to the global map, and it
      runs through a person. It answers v1.15's open question in part; other links may follow.
    - Stars never convert hardcore fans directly; hardcore fans still come only from the fan
      model and from cards' temporary effects. Losing a star costs casual reach and influence,
      not a hardcore crash.
    - Star effects stop while their league is not the flagship, as clubs go dormant when the
      seat moves.
  - *Careers (decided 2026-10-03).* Every number is config.
    - Each player has an age and a hidden peak skill. Skill climbs to peak around 27, holds,
      and declines after about 30, with a small random wobble each season on the flagship's own
      random stream. Founding clubs' players get spread-out ages (18–32) so the first generation
      does not retire at once.
    - Retirement is announced a season ahead. From 31, each season end may make a player's next
      season their final season (a chance rising with age and lost skill); everyone retires by
      37. The final season is a recorded fact cards and succession can use.
    - Fading stars keep their place (choose pain): a declining star stays a star with a shrinking
      strength bonus and holds a star place until retirement, blocking new breakouts.
    - Replacements follow club strength (choose pain): a retiring player's replacement is young,
      with peak skill drawn with a modest lean toward the club's rating, so strong clubs attract
      better talent.
    - Stars can move clubs within the flagship (choose pain): at a season's end a star may move
      to a club rated above theirs (config chance); the two clubs swap leading players, so every
      club keeps one. Each move is a landmark and a card, and only the player's backing levers
      can hold a star. No moves abroad in Phase 1 (other leagues have no named players).
    - Stars stay when the seat moves: they remain with their dormant clubs and keep ageing, and
      return if the seat comes back while they still play. The new flagship's clubs get their
      own leading players.
  - *What the player can do (decided 2026-10-03).* Every number is config.
    - Backing slots by PP tier: 1 at tiers 1–2, 2 at tiers 3–4, 3 at tier 5. Only stars can be
      backed. Backing and dropping happen only in the offseason (choose pain): the player
      commits for a year at a time.
    - Backing costs a one-time PP price (base × the peak tier's multiplier, as growth nodes) and
      no upkeep: slots are the limit, following the Phase 0 rule against PP upkeep. Revisit if
      bots hoard slots.
    - Influence grows from 0 to full over a number of seasons backed (e.g. 4). Dropping a star
      resets it; backing them again starts from 0. Dropping a star at full influence raises a
      pressure card (choose pain): on arrival, casual fans drain and a small share of hardcore
      fans demote in the flagship country. An earlier drop costs only the lost progress.
    - Honorable endings: when a backed star announces a final season, a succession decision
      arrives. Retire with honors (PP): their effects fade over a few seasons instead of
      stopping, and the retirement is a landmark the Hall of Fame can read. Mentor a successor
      (PP): a chosen young leading player who is not a star takes the slot with a share of the
      mentor's influence and a season's lift to their scoring credit; they become a star only by
      clearing the bar. Let them go (free): influence is lost, no goodwill cost. A retirement is
      never a drop.
    - Keeping a star (choose pain): when a backed star would move, a decision arrives. Keep them
      for flagship league cash (scaled by tier), which can push a weak league toward Struggling,
      or let them move for free: backing follows the person and keeps its influence, and the old
      club loses the strength. Unbacked stars move without asking.
    - No selling in Phase 1: a move within the league brings no money and moves abroad need
      foreign players. Letting a star move is how the player parts with one.
    - Backed stars stay backed when the seat moves (choose pain): they keep the slot while their
      effects pause, and freeing the slot is an ordinary drop.
  - *Stars on cards (decided 2026-10-03).* Every card is built from recorded facts.
    - The breakout moment: when a star is made, a moment always appears, takes no moment slot,
      carries PP by league tier (config) and quotes the recorded season. The sport's first-ever
      star is also a permanent landmark.
    - Succession, keep-or-let-move and the drop pressure card arrive when their fact happens.
      They are not season stories (the one-story limit does not apply) but count against the
      decision cap and are offered after the season cards. Unanswered, they resolve to the free
      default (let them go, let them move) and the star's influence is lost (choose pain).
    - Star moments use normal moment slots: a star's final season announced, a star retiring
      (also a landmark), an unbacked star moving clubs, and career records such as becoming the
      league's all-time top scorer, checked against retained records.
    - Season cards name the champion's leading player and the season's top scorer where the
      record supports it. No new story types in Phase 1; a "farewell title" story can follow
      playtest.
    - The succession card names its mentoring candidate: last season's top-scoring leading
      player who is not a star and is under a config age. With no candidate, mentoring is not
      offered. No picker screen.
    - Star injuries (a GDD negative event) are deferred to the parking lot: they need the match
      engine to handle missed matches.
    - Bots answer every star card and back stars through the same actions as the player. Backed
      stars feed spread, so the win contest is remeasured once.
  - *What is saved (decided 2026-10-03).* Each player keeps identity (name, birthplace, club,
    birth season), hidden peak and current skill, star-since season, the final-season flag and
    backing (season backed, influence), plus one permanent career line per season: club, matches,
    scores, playoff scores, final scores. Season summaries add the top scorer and any new star.
    Retired players and their careers are permanent. Who scored in each match is disposable:
    only season tallies are kept. Older saves gain fresh leading players at active clubs (spread
    ages, no stars, no invented careers; dormant clubs get theirs when they return), and the
    scoring-frequency match chances start with the next season, so no season mixes two rules.
  - *What the screen shows (decided 2026-10-03).* The flagship screen gains a Stars panel above
    the table (name, club, age, birthplace, this season's tally, career totals, star since, a
    final-season tag) with the backing slots: back and drop in the window only, through a review
    step that shows the PP price or the drop's cost. Each club row adds its leading player and
    their season tally. Skill is never shown, as a number or a word; influence is shown as a bar,
    since it is the player's own investment. No new map layer: backed stars act through the
    media reach channel, and the flagship country's tooltip names them. Skill and a star's
    strength bonus never enter the turn snapshot; the sim prices backing and judges legality.

**Venues & youth programs:** Each league has a venue capacity level (1–5) and a youth program level
(1–5) — no individual stadiums or academies.
- *Venues:* bought with cash in the offseason; take multiple turns to build; raise the gate
  revenue cap, add hardcore conversion, add upkeep.
- *Youth programs:* bought with cash; upkeep; accelerate hardcore conversion and improve homegrown
  player quality (stronger national teams).
- Simple version in Phase 1; Phase 2 adds depth (e.g., a named stadium for the flagship league).
- **Venues, first build (decided 2026-10-07, v1.30).** Every number is config.
  - *Scope:* the flagship only; other leagues stay on the Phase 0 model. Youth programs are parked
    (their payoff, stronger national teams, waits for the World Championship).
  - *A hard gate cap (choose pain):* gate is paid only on hardcore fans up to the venue's
    capacity. Capacity at levels 1–5 is a share of the country's population, keyed roughly to the
    promotion thresholds, so level 1 bites around Semi-Pro and a growing flagship stalls on gate
    until it builds.
  - *Promotion needs the venue (decided 2026-10-07, after measurement):* at the seat, promotion
    to Semi-Pro, Professional and Elite needs venue level 1, 2 and 3 (config), a blocker beside
    hardcore and reserve. Without it a careless promotion outran capacity and folded the anchor
    (the naive bot from Austria: 6 of 8 seeds; with the gate 0 of 8, pacing unchanged). The
    promotion review also shows the new tier's costs against revenue at today's capacity.
  - *Building:* bought with cash in the offseason, one level at a time; a level's price is quarters
    of the running cost of the tier it serves (or the league's own, if higher: found in play, a
    small league built big venues for almost nothing), rising with the level, and it takes several
    seasons to build.
    The old capacity keeps working while it builds. Upkeep joins the running cost when a level
    opens.
  - *Fans:* each level adds a modest boost to casual → hardcore conversion in the seat country; the
    boost fades while hardcore fans overflow capacity (no seat, no habit).
  - *Culture:* record crowds are fame facts: a season that sets a new league attendance record
    credits the champion's ground (European) or the final's host (American). Building past level 3
    modernizes the grounds and mildly offends famous-venue traditions.
  - *The seat:* each country's venue level stays with its league. A new seat starts at level 1
    (moving abroad means building again); the old seat keeps its level for a return.
- **Payroll, first build (decided 2026-10-07, v1.30).** Every number is config.
  - *A split, not a new cost:* the flagship's running cost becomes operations plus payroll, with
    the same total for a league without stars. Other leagues keep the single running cost.
  - *Stars draw wages:* each star playing in the flagship adds a wage of quarters of the league's
    running cost a season; ordinary leading players stay in the baseline. Club strength never
    enters payroll.
  - *Careers (choose pain):* a star's wage rises with every season as a star, and a backed star's
    with influence; it ends at retirement or a move.
  - *No menu:* payroll is pressure. Letting a star move when a star card offers it saves the
    wage, against the sponsor star clause and the broadcast.
  - *Shown:* the finances split operations and payroll; the Stars panel shows each star's wage,
    from star status, seasons as a star, influence and league tier, never skill.

**Config rule:** Every tunable number — conversion rates, weights, costs, curves, thresholds, turn
lengths — lives in config files. No balance values in code.

**Rules Evolution:**
- **When:** rule changes cost PP and happen only in the offseason, at most one per year
  (config). Costs scale with PP tier.
- **Purist backlash scales with size and tradition.** Backlash grows with the global hardcore base
  and with how long the rule has stood. Early inventor-era tinkering is nearly free; changing a
  decades-old rule at tier 5 is a major, risky event. Rule changes feed anchor resentment.
- **Rules are global.** One sport, one rulebook. Genome affinity makes the same change help some
  markets and hurt others, so the player weighs the whole map. No regional variants.
- **Proposals come from the player and the world.** The player can change any rule trait in the
  window. Broadcasters, sponsors, and league directors also propose changes via decision cards
  (accepted proposals count toward the yearly limit). Rival rule copying keeps it two-sided.
- **First build (decided 2026-10-04, v1.20).** The player's own amendments end to end: the
  seasonal-window action with a review step, the PP price, purist backlash, dated amendments in
  the Rulebook, and bots that amend. Proposals from broadcasters, sponsors and league directors
  arrive with the deals build, since those are the proposers.
  - *One amendment changes one rule trait* to any of its options. Its size is the jump: one step
    along contact, team size, match length, scoring or complexity counts 1, two steps count 2,
    and changing the play structure always counts 2.
  - *Timing:* fans and spread feel the new rule from the next quarter; the flagship plays it from
    its next season (as with the scoring rule); the backlash lands at once. At most one amendment
    per in-game year.
  - *Price:* a base PP price × the peak tier's cost multiplier × the jump, with no upkeep.
  - *Purist backlash (choose pain):* in every country a share of the player's hardcore fans turn
    casual. The share grows with the rule's age (how long that trait has stood, capped) and the
    jump; it is heavier in the anchor (standing in for anchor resentment until that is built) and
    in countries where the old option suited fans better than the new one. Early tinkering is
    nearly free; amending a rule that has stood for decades is a real loss. Traditions feed
    backlash (v1.22, Culture: offended traditions multiply it).
  - *Before deciding* the player sees the price, how many hardcore fans would turn casual, and
    +/− fit hints for the anchor and the five biggest markets only; where else the change helps is
    discovered on the map.
  - *The Rulebook* lists every amendment with its date ("Match length: standard to short, amended
    2031, over purist objection"), and its prose always describes the current rules.
  - *Built 2026-10-04:* 100 PP × tier multiplier × jump; backlash 3% per jump at full age (40
    years), anchor × 2, fit weight 2, capped at 25%. A better-fitting rulebook lets the leader pull
    clear, so the world championships were strengthened one step to keep the #1 contest at about
    half (34 of 68).
  - *Purists remember the founding rules (decided 2026-10-04, v1.21).* Measured: with amendments
    every sport adapted toward the population giants' tastes and contrasting sports came to share
    their top markets (differentiation 1 of 6 pairs, against 5 of 6 without). Backlash now also
    grows with how far a trait drifts from its founding rule (× 1 + drift weight × steps), and a
    move back toward it costs less; a hard bound on drift was tried and dropped (it did not stop
    the convergence). Convergence toward the giants is accepted as natural; big markets behave
    differently instead (Country attributes: Big and rich markets).

**History & Records:** Stories and retrospectives may only claim what the simulation retained.

- **Permanent layer:** landmark events (firsts; league formation, folding, promotion, step-down;
  PP tier changes; rule changes with dates; rivals reaching Entrenched; founding-family
  generational handoffs); per-league season summaries (champion, final standings, award winners
  once awards exist); career totals for every named player; all-time records.
- **Disposable layer:** individual match results and quarter-level detail, pruned after each
  season.
- **Yearly world snapshot:** fan buckets for every country × sport, recorded each in-game year.
  Powers provable headlines ("overtook cricket in India in 2071"), retrospective charts, and a
  heatmap timelapse (a 9x16 key-moment candidate).
- **Headlines reference records.** Every Moment references the records it describes. Superlatives
  ("record," "first since") must be checked against retained records; content validation rejects
  templates that claim without checking.
- **Save size:** no cap on the permanent layer; benchmark a simulated 120-year save (file size,
  load time) early in Phase 0.
- **Almanac:** history data is recorded from Phase 0; a browsable Almanac screen ships later
  alongside the Hall of Fame (Phase 2).

**Fans → business:** Hardcore fans drive attendance and stable cash; casual fans drive TV and
sponsor reach. Attendance does not create fans — it accelerates casual → hardcore conversion. This
is how popularity reaches the business layer without Cash feeding PP.

**Dual currency:**
- **Popularity Points (PP):** Global currency. Governs the sport itself — traits, rules, growth
  nodes.
- **Cash:** Per-country currency. Governs league business — teams, venues, sponsors. Managed
  independently per country's top-flight league (not pooled globally).

**Currency relationship:** One-directional. Higher PP tier unlocks better Cash opportunities
(sponsors take a maturing sport seriously), and PP can fund emergency league bailouts. Cash never
produces PP; it can only build fans locally through venues and youth programs.

**Cash sources:** Gate revenue (attendance × venue size), TV deals, sponsorships.

**Business Layer (per country league):** the full layer below runs at the flagship, where the
player is commissioner (v1.11). Other leagues keep the Phase 0 subset (one combined revenue line);
whether they later gain individual deals is open.
- **Revenue:** *gate* = hardcore fans × country wealth, capped by venue capacity; *TV* = casual
  reach × media market size; *sponsors* = total reach × wealth. PP tier caps the size of TV and
  sponsor deals on offer.
- **Costs:** payroll (from contracts; scales with player quality and league tier), operations
  (base cost by league tier), venue upkeep, league director salary (Phase 1; none at the flagship).
- **Deals:** TV and sponsor deals are multi-year contracts offered in the offseason — length,
  annual value, and sometimes a demand (rule-change proposal, exclusivity, "stay Professional or
  above"). Untouched offers lapse when the offseason closes. Long deals trade security
  for locked terms.
- **Flagship deals (decided 2026-10-05, v1.28).** Every number is config.
  - *Scope:* the flagship only. Other leagues keep the Phase 0 combined revenue line.
  - *What a deal pays against (choose pain):* without deals the flagship keeps only a share of
    today's media line (e.g. 40%). A deal pays a fixed annual value, set at signing from the market
    then (TV: casual fans × media market; sponsor: all fans × wealth) and capped by PP tier. Fixed
    both ways: it pays if fans fall and misses growth if they rise.
  - *Slots:* one TV deal; sponsor slots growing with the league tier (e.g. Amateur 1, Semi-Pro 1,
    Professional 2, Elite 3), the first being the main sponsor, where the homegrown gear brand is
    an option; and a naming-rights slot for each eligible ground (the founding ground or a famous
    one), the betrayal tradition stickiness expects.
  - *Offers:* only in the offseason, on its screen. Each open slot gets 2–3 offers drawn on the
    flagship's own random stream, so the world's sequence never depends on deals. A slot may stay
    empty (the reduced baseline).
  - *Length and renewal:* 1–5 seasons with the value locked for the term. At expiry the current
    partner offers a renewal at today's market value with a loyalty edge, beside fresh offers. No
    early exit: a deal ends early only by breaking its demand, at a penalty.
  - *Demands (first build):* a *rule change* (a broadcaster wants shorter matches, a sponsor more
    scoring; this is how broadcasters' and sponsors' rule proposals arrive), a *tier floor* ("stay
    Professional or above"), a *seat lock* (the league stays in this country) and *TV exclusivity*
    (pay-TV: pays more, but the broadcast's lift is cut while it runs).
  - *Demands never block (choose pain).* Doing the thing breaks the deal. A rule demand is met by
    amending that rule before the deal's second offseason closes. A forced breach counts too: an
    unavoidable step-down, or a seat sent home when a flagship folds.
  - *A breach costs:* the deal ends and its remaining value is lost, a cash penalty of about one
    season's value, and the partner makes no offers for a few seasons.
  - *Demands pay:* each demand raises an offer (e.g. +30–60%). Demand-free offers are smaller; the
    homegrown gear brand is always demand-free and smallest, with a bigger loyalty edge at renewal.
  - *Naming rights betray:* signing them on a famous ground wears down that ground's tradition and
    turns hardcore fans casual in the seat country (by tradition weight and ethos, as a trophy
    rename does), and cuts its pilgrimage while the name stands; on the founding ground it offends
    the club rite. Rule demands need nothing new: amendments already offend traditions.
  - *Rivals:* signed deals keep paying through countermoves (locked terms are the security). In
    the seat country a rival sponsor lockout makes new sponsor offers fewer and smaller and blocks
    sponsor renewals while it runs; a rival broadcast deal leaves no TV offers at all (choose pain).
  - *The TV fork shapes TV offers:* Pay-TV Exclusivity owners get bigger TV offers, more often
    exclusive; Free-to-Air owners get smaller ones and never exclusivity. The nodes keep their
    effects.
  - *No new cash spend yet.* Cash feeds health, promotion, keeping stars and breach penalties;
    venues and youth programs come later (parked). Guard: a full slate of ordinary offers is worth
    about 100–120% of today's media line, so going without hurts and signing everything does not
    make the flagship unsinkable.
  - *Rule demands* come from the partner's kind and move a rule one step (e.g. TV: shorter
    matches, more scoring, fewer stoppages; sponsors: less contact, simpler rules; lists in
    config), never toward the rule already in place. The Rulebook marks a demanded rule "due by
    season N".
  - *Rule demands are rare, never required.* Every open slot, TV included, always has at least
    one offer without a rule demand. At most one offer with a rule demand per offseason across
    all slots, none while a signed deal's rule demand is still due, and only a modest chance of
    one in any offseason (config). A deal never needs a rule change to be had. A rule demand comes
    only on a deal still running at its deadline (found in play, 2026-10-06: a one-season deal
    would have paid the premium for a demand that could never break).
  - *Bots* take the highest-value offer per slot, demands included, and play on as usual; the
    runner reports deals signed, demands met and breaches by kind.
  - *Clauses: partners want the product (decided 2026-10-06, v1.29).* Built and measured, rule
    demands were a bust: rare, a request to change the sport for money, and in play either free
    money or a trap (bots broke 97% of them). They stay, at half the chance. Partners now mostly
    want what they bought, through clauses tied to systems already built:
    - *Competitive balance (TV):* no runaway or foregone-league season (the broadcast's season
      interest). The club-rating season cards, the one lever on balance, now matter for money.
    - *A star (sponsors):* a star playing at the seat, backed or not.
    - *Fans (any partner):* the seat country's fans at a season's end no fewer than at the
      previous season's end (at signing for the first), within a small tolerance (e.g. 0.5%): a
      meaningful drop misses, not a wobble (revised after measuring: with none it was met only
      60% of seasons and 39% of its partners walked; 2% made it free).
    - *Soft, because dice decide them:* each clause is judged at every season's end the deal pays.
      Met: a small bonus that season and a larger renewal edge. Missed: nothing. Two misses in a
      row and the partner walks: the rest of the deal is lost, with no cash penalty and no
      shunning. Still pain, not a cliff.
    - *Like other demands:* a chance per offer and a premium; one demand or clause per offer; a
      slot always keeps an offer without one. Every number is config. A clause comes only on a
      deal long enough for a walk to cost something (found in play, 2026-10-06: one-season clause
      deals paid the premium for almost no risk).
  - *On screen:* a Deals section on the offseason screen (each slot's signed deal with value,
    seasons left and demand with its due season; 2–3 offer cards per open slot with value, length,
    the demand in plain words and a betrayal warning on naming rights). Signing confirms only for
    a demand or a betrayal; unsigned offers lapse when the offseason closes. A read-only Deals card
    on the Flagship tab.
  - *News:* a breach is a big moment (a back page) with its cost; a rule demand due this offseason
    is flagged on the offseason screen; a renewal from the current partner is marked; a deal ending
    at term is a minor toast.
  - *Partners* have invented names from pools (never real brands or broadcasters) and a kind
    (broadcaster, or a sponsor by sector); the gear brand is named from the sport's identity.
  - *Saves:* format 20 adds the flagship's deals (signed, on the table, partners who shun you).
    A format 19 save migrates with none; the reduced baseline starts at its next offseason, when
    the first offers arrive.
  - *Guard:* a full slate of ordinary offers is worth 100–120% of the media line it replaces, by
    league tier; pacing passes and the #1 contest stays about half; the flagship's Near-Collapse
    rate is reported against the build before deals; deal share of flagship revenue and breach
    rates are reported only.
- **Cash can build fans locally and indirectly.** Cash funds venues and youth programs that
  accelerate casual → hardcore conversion in that country. Cash never produces PP directly.
- **No transfers between countries.** A league in trouble can receive an **emergency bailout paid
  in PP** — expensive, with a cooldown (PP → Cash is the permitted direction).
- **League health** is evaluated each turn from cash runway (turns of losses reserves can cover),
  cash flow trend, and the country's hardcore fan trend; it moves at most one step per turn.
- **Phase 0 subset:** gate revenue plus one combined "media & sponsor" revenue line; running cost =
  league tier × country wealth, with a minimum per league tier so a tiny country's professional
  league cannot run for almost nothing (decided 2026-09-13); League Health Ladder, league
  promotion, and PP bailout included.
  No individual deals, payroll detail, or venues.

**Global PP Tier Track:** 5 qualitative tiers, from minor sport to global phenomenon. Crossing a
tier unlocks new growth nodes/abilities but raises expectations and requirements — the "growing
pains" tension mechanic. This is independent of rival-sport pressure; the sport's own growth is
inherently destabilizing if you're not ready for it.

| Tier | Name | Tier-up requires (Fandom Score threshold, plus) | Turn length | Focus slots | Nodes unlocked |
|---|---|---|---|---|---|
| 1 | Backyard Game | — (start) | Quarter | 1 | Grassroots |
| 2 | Local Curiosity | Anchor league reaches semi-pro | Quarter | 2 | + Media |
| 3 | National Pastime | X% hardcore in anchor country | Half-year | 3 | + Infrastructure |
| 4 | International Sport | Pro leagues on N continents | Half-year | 4 | + Culture |
| 5 | Global Religion | Top-3 global Fandom Score | Year | 5–6 | + Global |

- Cost multiplier and negative event rate rise with each tier. All thresholds and values in config.
- **Tier-ups are automatic and cannot be delayed.** They are telegraphed a few turns ahead
  ("Approaching National Pastime"). Growing pains arrive whether or not the player is ready —
  failing to prepare is a legitimate way to struggle; holding a tier to dodge problems is not
  allowed.
- **Demotion is a penalty for severe, sustained failure — never flutter.**
  - *Judged on the tier's breadth condition*, not just the score (e.g., a National Pastime whose
    anchor hardcore share falls to half its target).
  - *Wide gap:* at risk only when below a demotion line well under the promotion condition
    (e.g., 50%, config).
  - *Sustained:* must stay below the line for N consecutive turns (e.g., 4, config). A "Tier at
    risk" warning with a countdown appears the first turn below the line.
  - *Cooldown:* no promotion or demotion for M turns after any tier change.
  - *Consequences:* lose a focus slot (the player chooses which market to drop); turn length
    reverts to the lower tier's; purchased nodes are kept, but no new nodes can be bought from a
    category the lower tier does not unlock; cost multipliers stay at the higher level until
    re-promotion. Demotion surfaces as a major Moment.

**League Health Ladder (per country):** Healthy → Struggling → Near-Collapse → Collapsed. Demotion
is driven by negative cash flow and falling local popularity. Local and largely reversible — except
in the anchor country, where full collapse ends the game.

**Late-Game Pressure:** Prevents a mature anchor from becoming unloseable and a lead from
snowballing. Works alongside tier-scaled costs, tier-scaled negative events, and the win hold.

- **Anchor resentment.** As the sport globalizes, anchor-country purists feel abandoned. Driven by
  time since the anchor last held a focus slot and by the number of TV/casual-friendly rule
  changes. Expressed as hardcore demotion and league health drag at home.
- **Generational turnover.** A small annual share of hardcore fans ages out everywhere (low rate,
  config). Mature markets must keep converting new fans; no base lasts forever without upkeep.
  Rules (decided 2026-09-13): aging fans demote to casual about the same sport (hardcore loss is
  demotion, never a skip to uninterested). Turnover applies to the player's sport and every rival.
  The "other sports" bucket is exempt: it is a fixed backdrop that never recruits. Rivals recruit
  replacements for their aging fans from their own casual fans, so an incumbent holds its ground
  unless the player actually wins fans from it; the player gets no replacement. A tiny floor share
  per country keeps a sport from vanishing through aging alone.
- **Professionalization raises running costs.** Higher league tiers cost more to run, so a pro
  league whose fans slip descends the League Health Ladder faster than an amateur one. Moving up a
  tier is both progress and exposure.
- **Rivals defend hardest near the top.** Rival defensive intensity peaks as the player approaches
  global #1 — defending their global position, not hunting the player — making the win hold a real
  contest. Details under rival AI.
  - *How (built 2026-09-19):* intensity peaks a little past #1, so a narrow lead draws the hardest
    defense and the player must pull clear to hold it. Near the top a rival stays escalated wherever
    the player holds ground in its territory, not only where the player is gaining, and may buy more
    countermoves per quarter. Youth programs push a rival above its home level while they run, and
    that ground ages away afterwards; a media blitz is a surge that fades. A rival saves up for the
    countermove it wants most rather than spending on a lesser one.
  - *Target:* about half the campaigns that take #1 lose it at least once before winning (measured
    40–46% on typical anchors, builder bot, 2026-09-19; 43% on the final content).

**Rival AI:** Rivals defend; they don't hunt.

- **Lineup:** real-world existing sports rather than fictional incumbents. The campaign starts in
  the present day, on the current world map with current population data.
  - **Modeled rivals:** soccer, cricket, basketball, American football, baseball, ice hockey,
    rugby, and a combined combat sports bucket.
  - **"Other sports" bucket:** holds each country's remaining hardcore share. It can lose fans to
    the player (slowly, through demotion; see Fan Model) but never defends.
  - **Phase 0:** soccer (global giant) and cricket (regional stronghold).
  - Each rival has its own genome (driving the similarity rule), home regions, and fan buckets in
    every country.
- **Starting fan data:** as realistic to the current world as possible, researched from public
  sources, with sources noted alongside the data. Method and rival genomes: see Real-world data
  under Progression & Economy.
- **Naming boundary:** real sport names are used. Real leagues, governing bodies, tournaments,
  teams, and players are not — they use generic or fictional names (e.g., "the soccer
  establishment"). **All real-world-facing names live in a single data file**, so players can mod
  names later without touching anything else.
- **Defense budget.** Each rival earns a defense budget from its own Fandom Score and cannot defend
  everywhere at once — the same attention scarcity the player faces. Pushing multiple fronts can
  overwhelm a rival; attacking its home region draws its full strength.
- **Escalation ladder** per rival, per country: Watching → Defending → Entrenched. Driven by the
  player's hardcore gains where that rival holds meaningful hardcore share (thresholds in config).
  All rivals defend harder globally as the player approaches #1. Pulling back lets a country slowly
  de-escalate.
- **Countermoves (closed list, each spends rival budget):** media blitz (rival casual conversion
  boost), youth programs (rival hardcore conversion boost), exclusive broadcast deal (blocks the
  player's media reach channel in that country for a period), sponsor lockout (worse cash offers
  for the player's league there), rule copying (rival adopts one of the player's popular traits,
  eroding similarity advantage), reclaim (near #1 only: the rival wins back a share of the
  player's hardcore fans each quarter while it runs). Every countermove surfaces as a Moment.
- **Reclaim (decided 2026-10-04, v1.17).** Bought only while the player is near global #1 (the
  near-top ramp), only where the rival is Entrenched, and only in countries where the rival was the
  incumbent at the start (its home hardcore share is meaningful), never where the player built
  from nothing. While it runs, a config share of the player's hardcore fans there switch to the
  rival each quarter. Ground won above home ages away after it ends, as with youth programs. Each
  reclaim is a landmark and arrives as a pressure moment ("Soccer wins back the terraces in
  Argentina"), so a lost lead has a visible cause. Countermove resistance in the growth tree
  shrinks it like any countermove.
- **World championships (decided 2026-10-04, v1.17).** Each modeled rival has a quadrennial world
  championship on its real cycle (soccer from 2026, cricket from 2027; dates and sizes in config).
  For a year the rival converts more casual and hardcore fans in every country and rebuilds above
  its home level; that ground ages away afterward, so the rival swings up and back every four
  years whatever the player does. Generic names (naming boundary: "the soccer world
  championship"), in the names file. Each one is a landmark and a moment card. Rival-to-rival
  competition is still later.
- **Visibility:** escalation level is shown on the map; rival budgets are hidden.
- **Rival vs. rival competition:** wanted later, not in Phase 0. Until then rivals only drift slowly
  and react to the player.
- **Rivals hold their ground (decided 2026-09-18).** Each rival's real starting fan shares in a
  country are its home level. Left alone it stays there: it neither spreads to new countries nor
  grows past the real data. It loses ground only to the player's poaching, drifts back toward home
  slowly, and its countermoves push it above home for a while. It rebuilds lost hardcore fans only
  up to its home level. (Before this, untuned drift let soccer grow ~45% and cricket double over a
  campaign, spreading cricket to ~7% hardcore in China and Germany, and no campaign could reach #1.)

**"Good run" texture:** Climbing the PP tier track while watching leagues in multiple countries
flourish — new stars, sponsor wins, storylines.

**"Bad run" texture:** A country sliding down the League Health Ladder, a rival sport capturing
ground you'd invested in, or worst of all, warning signs appearing in your anchor country while
your attention is elsewhere.

**Run structure:** Single continuous campaign toward global #1. Custom scenarios/challenges
(Phase 2) use a separate, shorter run structure:

- **Scenario = data file** (same YAML/Zod pipeline, moddable): start state (anchor, era, rival
  strength, optional preset genome), modifiers (e.g., no Media tree, rules locked, rivals start
  Entrenched), goal (e.g., overtake cricket in India), and turn limit.
- **Leaderboards are scenario-only.** The main campaign has no leaderboard.
- **Scoring** is defined per scenario; default is fewest turns to goal, tie-break final Fandom Score.
- **Ranked integrity:** ranked runs use a single suspend save (quit and resume, no reloading) and a
  fixed seed per scenario so everyone plays the same world. Unranked scenario play allows normal
  saves. File-copy cheating is accepted for casual leaderboards.
- **Weekly Challenge:** rotating seed plus random modifier set, one ranked attempt per week.
- **Launch content:** ~6–10 hand-made scenarios at Phase 2 launch, including the ~1900 historical
  start. Steam Workshop support is post-launch; files are moddable from day one.

**Campaign length:** Target ~10–15 hours to the first win (~180 turns, ~120 in-game years).
Starting budget, all values in config and tuned by balance runs:

| PP tier | Turns | Min/turn | Real time | In-game years |
|---|---|---|---|---|
| 1 | ~40 | 1 | 40 min | ~10 |
| 2 | ~10 | 2 | 20 min | ~2.5 |
| 3 | ~40 | 4 | 2.7 hr | ~20 |
| 4 | ~40 | 5 | 3.3 hr | ~30 |
| 5 | ~50 | 6 | 5 hr | ~50 |

**Pacing is for a typical anchor (decided 2026-09-13).** The turn budget above describes a
typical-size anchor country. Anchor size is the main difficulty lever: a huge anchor needs far more
hardcore fans and cash before its league can go Semi-Pro, so it reaches Local Curiosity much later,
and a tiny anchor is fragile. Leagues are not made cheaper to hide that.

**Long backyard era (decided 2026-09-14).** Backyard Game lasts about 40 turns (~10 in-game years)
and Local Curiosity about 10. Reaching Local Curiosity needs a Semi-Pro anchor league, and an
amateur league cannot afford that until its fans pay for it — roughly a decade of scrappy growth on a
typical anchor. Once it can, National Pastime follows quickly. The campaign total (~180 turns,
~12 hours) is unchanged.

**Replay levers:** Anchor country choice and sport genome. Scenarios (Phase 2) provide further
variety.

**Difficulty:** Anchor country choice is the primary lever, shown with a visible difficulty rating
(small, poor, or rival-saturated countries are harder). Easy / Normal / Hard presets additionally
scale rival aggression and economy values via config.

**Saves:** Normal saving and loading with multiple save slots. No ironman mode.

**The founder across 120 years:** The player is the founding family. Leadership passes through
the family across generations as flavor only — no succession mechanics.

---

## Tone & Art Direction

**Tonal register:** Dry sports humor — deadpan, observational, almanac-with-a-wink. Not slapstick,
not tabloid hysteria.

**UI feel:** Stylized/illustrated, not clinical spreadsheet-style. The world map is the visual and
interactive center of the game.

**Reference points:** Plague Inc. (spread/heatmap fantasy, UI clarity), Football Manager (sim
depth, persistent entity management), Capitalism Lab (business/tycoon layer).

**Showing the sport:** Players see the sport they invented.
- **Rulebook page (Phase 0):** generated from the genome in almanac prose ("Played on grass by two
  sides of eleven. Contact is incidental."). Rule changes appear as dated amendments ("Match
  length reduced to 45 minutes — amended 2071, over purist objection"), making the rulebook a
  readable history.
- **Field diagram (Phase 1):** generated from surface, team size, and equipment traits.
- **Logo, ball, kit (Phase 2):** player-made in a simple editor (emblem, colors, lettering, name)
  starting from presets.
- **Save as image (Phase 2):** rulebook, field diagram, and logo exportable at 9x16.

**Map and markets:** The market list starts from FIFA's member associations, so England,
Scotland, Wales, and Northern Ireland are separate markets, as are sports territories such as
Chinese Taipei and Hong Kong. Only places with real sports salience are included; entries without
it (e.g., Kosovo, Palestine) are left out (decided 2026-09-13). Tuvalu stays as the signature hard
anchor. The map uses Natural Earth de facto boundaries; contested areas and land outside any
market are drawn with neutral hatching and belong to no market.

**Onboarding:**
- **Guided first campaign:** a dismissible "Founder's Notebook" shows short tips the first time
  each system appears. Tier-gated unlocks provide progressive disclosure, so the tier structure
  does most of the teaching. No separate tutorial scenario.
- **Quick start:** preset genome templates (e.g., "Backyard Kickball," "Ice Paddle") plus a
  highlighted easy anchor. Custom genome design remains the default.
- **Explanatory tooltips:** hovering a number gives a short plain-language explanation of its main
  drivers (e.g., "Growing fast: your focus here, strong climate fit, Street Courts") — not literal
  formulas. Nested tooltips supported. (A formula breakdown may exist in a developer-only mode for
  balance work.)

**Screen structure (map-centric):** The world map is home and always underneath; every screen is
one click away, and panels overlay the map rather than replacing it.

| Screen | Form |
|---|---|
| World map | Home |
| Country panel | Slide-out over map: fans, league, rivals, finances, policies |
| Sport | Genome, rulebook, rules evolution |
| Growth tree | Full screen |
| Leagues overview | Sortable table the player opens on demand (pull, not push — not an inbox) |
| Almanac | History, Hall of Fame, records |
| Recap / decision cards | Turn-start overlays |

**Map lenses:** your fandom (hardcore/casual), rival dominance, league health, finances, spread
channels, and affinity (shown only for countries with existing exposure, preserving discovery).

**Steam Deck / controller:** designed in from the start — full controller navigation, readable at
1280×800.

**Audio:** Music is postponed — not a design priority (players commonly bring their own). Sound
effects come very late in production; direction then: crowd murmur scaled to fandom when hovering
a country, a distinctive pickup sound, no voice acting.

**Accessibility baseline (from the start):** colorblind-safe heatmaps (patterns and alternate
palettes, not color alone), UI and text scaling, rebindable controls, reduced-motion option for
key moments. Turn-based play means no time pressure.

**Localization:**
- English only for Early Access; 1.0 languages chosen from wishlist geography (likely French,
  German, Spanish, Brazilian Portuguese, Simplified Chinese).
- Event templates are written translation-ready from the start: short lines, no concatenated
  sentence fragments, names and numbers as variables. Grammar-assembled flavor text stays
  English-only.
- Territory names follow international sports-body naming (e.g., "Chinese Taipei"), set in the
  moddable names data file.

**Camera-friendly design constraint:** Key moments — tier-ups, championships, storyline beats,
Hall of Fame inductions — should render as visually clean, high-contrast, single-focal-point
screens, filmable in vertical (9x16) video without a dedicated export mode. This is a standing
design discipline applied across relevant screens, not a separate system. The core UI (map,
management panels) is not vertical-native and is not expected to be.

---

## Technical Constraints

**Platform:** Desktop, with Steam release as the target.

**Stack:** TypeScript + Electron (PixiJS for rendering), decided September 12, 2026. See
`sports-founder-tech-plan.md` for rationale, architecture, and supporting libraries.

**Team:** Solo developer.

**Time budget:** Open-ended, spare-time project, worked on between bursts on other active titles
(Track Star currently live).

**Documentation posture:** This GDD is a design contract, not an implementation/build plan.
Detailed technical breakdowns and build tickets are a separate, later effort.

---

## Scope & Build Phasing (Section 7 Notes)

This project deliberately does not use a traditional "in scope / cut" framing — there is no
deadline forcing exclusions. Instead:

- **Phasing, not cutting:** All 16 systems listed above are considered part of the eventual game.
  They are sequenced by dependency, not filtered by importance.
- **Playability milestone:** The core loop is considered playable/testable once Phase 1
  (systems 1–8) is complete.
- **Deferred analysis:** Black-hole risk assessment (which systems could swallow unlimited dev
  time) and sequel/future scope planning were explicitly deferred as premature at this design
  stage. Revisit both once Phase 1 is built and real development velocity is known.

---

## Open Design Questions (Parking Lot)

Items flagged during the interview that need further discussion in future sessions:

- Music direction: postponed by choice; revisit late in production if ever.
- Commercial decisions — deferred by choice (2026-09-13): price, Early Access timing, demo scope,
  DLC, Steam page timing, platforms. Tech plan §11 holds the current thinking.
- Competitor analysis: a thorough Steam tag sweep (research task, not a design decision).
- Water as a genome surface option (parked 2026-09-13).
- Women's sports (parked 2026-10-03): a women's version of the player's sport, as an option built
  much later. Until then every sport is men's (players, name pools, text).
- Flagship talent pull (parked 2026-10-05, v1.23): the flagship should work like the Premier
  League or the NBA, a top flight that draws the world's best players. Foreign stars moving in
  need named standouts in other leagues first; build it with them, not with the broadcast.
- Standing policies (parked 2026-10-07, v1.30): nothing to delegate while other leagues have no
  business; they return with individual deals or venues at other leagues.
- Flagship ticket pricing (parked 2026-10-07, v1.30): a cheap, standard or premium stance (more
  gate per fan against slower conversion), tied to the venue cap. Revisit after the cap is
  measured.
- Hall of Fame wings for league directors and founding-family members (parked 2026-10-07,
  v1.31): they wait until those people exist in the simulation.
- Outlet words and player names by language sphere and country (parked 2026-10-08, v1.34): e.g.
  "Deportes Hoy"; the United States draws British given and family names today.
- Scores worth points by the sport's term (parked 2026-10-08, v1.34): a try 5, a kick 3, a
  basket 2 or 3, on top of the refitted engine's totals. Flavor only.
- The sim in dollars (parked 2026-10-08, v1.34): convert every money number in the sim and config
  to dollars instead of a display conversion (`dollarsPerCash`). No gameplay gain; come back when
  the money model is next reworked.
- Late rewards in what is scarce late (parked 2026-10-08, v1.32): late in a campaign PP piles up
  (~100K banked) and card PP rewards are noise, but scaling them up ends the #1 contest. Late cards
  could pay in fans, cash or culture instead. Needs a design session.
- Player of the Year (parked 2026-10-08, v1.33): a global award once other leagues have named
  players; until then it would always name the flagship's Player of the Season.
- Star injuries (parked 2026-10-03): a negative event that needs the flagship match engine to
  handle missed matches; deferred from the Phase 1 stars build.
- Commissioner's seat follow-ups (parked 2026-09-26; seat eligibility and the folded-flagship
  rule decided 2026-10-02): whether other leagues ever get individual deals; where the seat goes
  when the anchor league has folded after the win; whether a flagship restructured below
  Professional keeps the seat; and whether playtest thinness
  was too few decisions per turn or nothing to get attached to (the seat answers the second
  directly, the first only at the flagship).
