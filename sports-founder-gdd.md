# Sports Founder — Game Design Document
*Version 1.5 | September 13, 2026 — all core and Phase 2 design decisions made; Phase 0 build gaps being closed (v1.4: slow hardcore poaching between sports; v1.5: Phase 0 growth tree, generational turnover rules, "choose pain")*

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
- **Seasonal windows:** one per in-game year. At quarter-length turns it falls on one turn in four;
  at year-length turns every turn includes it.
- **Auto-advance (low priority):** an optional "advance until something happens" control that
  always stops for decision cards, seasonal windows, League Health Ladder changes (anchor always;
  others in focus countries), PP tier-ups, rival moves in focus countries, and the start of the win
  hold / the win. Interrupt list lives in config. Not required for Phase 0.

**Turn anatomy:**
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
   (Easy / Normal / Hard); optional visible, shareable seed.

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
- **Seasonal windows.** League business (sponsor and TV renewals, etc.) happens in defined
  offseason windows rather than trickling in every turn — quiet turns punctuated by busy windows.
- **Crises become decision cards.** Urgent league problems compete for the capped decision-card
  slots; anything that doesn't surface resolves via the player's standing policies.

**Delegation (scaling to 30+ markets):**
- **Standing policies:** a small set of global defaults with per-country overrides (e.g., minimum
  acceptable sponsor offer, ticket pricing stance, routine-crisis response). Policy resolves any
  window business the player doesn't touch.
- **Focus slots define hands-on involvement.** Seasonal-window business surfaces to the player only
  in focus countries; elsewhere it resolves via policy and reports as Moments. Focus means both
  "where I push growth" and "where I personally operate," which feeds anchor-neglect pressure.
- **Commissioners (Phase 1, not Phase 0):** hireable per country; execute policies with
  trait-driven bias (e.g., Frugal banks cash and skips marginal sponsors; Showman pushes early
  promotion; Scandal-prone gets results but generates story events). Paid from league cash. They
  are also the advisor voice for league issues.
- **The player can always intervene** in any country directly. Delegation is a default, not a
  lock.

**League tiers:** Each country has a single top league (no multi-division pyramid, no promotion/
relegation). That league progresses through professionalization tiers, giving football-pyramid-
style gradations of maturity: **Amateur → Semi-Pro → Professional → Elite**.

- **Formation:** a country has fans only (no league) until its hardcore fans cross a threshold;
  then an Amateur league forms automatically (milestone pickup) and the country becomes an active
  market. The anchor country starts with an Amateur league.
- **Promotion is the player's call.** Once a league qualifies (hardcore fan base + cash reserve
  thresholds), the player may promote it during the seasonal window. Promotion costs cash and
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
  ripple to fans worldwide). Reassignable only during a seasonal window, at a purist cost in the
  former flagship's country. Multiple leagues can reach Elite.

**Simulation depth by league tier:**

| Stage | Simulated |
|---|---|
| No league | Fan buckets only |
| Amateur | Named teams, results, standings |
| Semi-Pro | + a few named star players per team |
| Professional / Elite | Full rosters |

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
Health Ladder below). Other countries' leagues can collapse without ending the run — losing your
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
  hardcore demotion (scandals); league health nudge. Content selects from this list and is
  validated at load. Effects are local and temporary by default; permanent effects are rare and
  clearly flagged.
- **Volume per turn:** moment count scales with turn length and number of active markets, so
  long late-game turns don't thin out. Decision cards are capped (~1–3 per turn, config).
  League management in active markets supplies additional per-turn activity, while global
  decisions stay macro.
- **Pickups:** clicking opens the story and collects the PP immediately; uncollected pickups
  auto-collect at end of turn. No lost rewards.
- **Negative events** (scandals, star injuries, rival coups) occur throughout and grow more
  frequent at higher PP tiers, reinforcing growing pains and feeding late-game pressure.

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
| Culture | 4 | Hardcore stickiness, rule-change backlash and anchor resentment resistance, generational turnover |
| Global | 5 | Cold launches, rival defense budget reduction, flagship bonuses, holding #1 |

- **Exclusive forks:** 1–2 per category; choosing one locks out the other (e.g., Pay-TV exclusivity:
  +cash, −casual reach vs. Free-to-air: +casual reach, −cash).
- **No refunds.** Purchased nodes are permanent — choices must hurt.
- **Cost:** base cost × current PP tier multiplier. Buying before a tier-up is cheaper, rewarding
  preparation for growing pains.
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
  **Hosting:** countries bid in the seasonal window and the player picks the host, which gains a
  large hardcore conversion and cash boost — a strategic tool for cracking a target market.
- **Field:** countries with a league at Semi-Pro or above, plus the host; 16 or 32 teams depending
  on eligibility; seeded by strength. No qualification simulation.
- **National team strength:** built from the best players of that nationality wherever they play
  club football — a country without a pro league can field a strong team from stars abroad.
- **Upsets:** matches are simulated with genuine upset chances; an underdog's deep run gives a
  large boost in that country ("Tuvalu reaches the semifinal").

**Hall of Fame:** Annual classes selected automatically from retained records (career thresholds in
config). Wings: players, commissioners, founding-family members, and a Moments wing for landmark
events. Each induction is a 9x16 key moment. Mechanical effect: each inductee adds permanent
hardcore stickiness in their home country.

**Awards:** Player of the Season per league and a global Player of the Year. Mostly flavor — they
feed Hall of Fame eligibility, raise star power (affecting transfers toward the flagship), and name
names in stories.

**Press coverage:** Presentation only; no press sentiment system. Fictional outlets per country
(in the names data file); headlines built from record-backed Moments, with English-only flavor
variety. Big turns can show a newspaper-style front page in the recap (a 9x16 candidate).

**Venues & youth programs:** Each league has a venue capacity level (1–5) and a youth program level
(1–5) — no individual stadiums or academies.
- *Venues:* bought with cash in the seasonal window; take multiple turns to build; raise the gate
  revenue cap, add hardcore conversion, add upkeep.
- *Youth programs:* bought with cash; upkeep; accelerate hardcore conversion and improve homegrown
  player quality (stronger national teams).
- Simple version in Phase 1; Phase 2 adds depth (e.g., a named stadium for the flagship league).

**Config rule:** Every tunable number — conversion rates, weights, costs, curves, thresholds, turn
lengths — lives in config files. No balance values in code.

**Rules Evolution:**
- **When:** rule changes cost PP and happen only in the seasonal window, at most one per year
  (config). Costs scale with PP tier.
- **Purist backlash scales with size and tradition.** Backlash grows with the global hardcore base
  and with how long the rule has stood. Early inventor-era tinkering is nearly free; changing a
  decades-old rule at tier 5 is a major, risky event. Rule changes feed anchor resentment.
- **Rules are global.** One sport, one rulebook. Genome affinity makes the same change help some
  markets and hurt others, so the player weighs the whole map. No regional variants.
- **Proposals come from the player and the world.** The player can change any rule trait in the
  window. Broadcasters, sponsors, and commissioners also propose changes via decision cards
  (accepted proposals count toward the yearly limit). Rival rule copying keeps it two-sided.

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

**Business Layer (per country league):**
- **Revenue:** *gate* = hardcore fans × country wealth, capped by venue capacity; *TV* = casual
  reach × media market size; *sponsors* = total reach × wealth. PP tier caps the size of TV and
  sponsor deals on offer.
- **Costs:** payroll (from contracts; scales with player quality and league tier), operations
  (base cost by league tier), venue upkeep, commissioner salary (Phase 1).
- **Deals:** TV and sponsor deals are multi-year contracts offered in the seasonal window — length,
  annual value, and sometimes a demand (rule-change proposal, exclusivity, "stay Professional or
  above"). Standing policy accepts or rejects outside focus countries. Long deals trade security
  for locked terms.
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
  eroding similarity advantage). Every countermove surfaces as a Moment.
- **Visibility:** escalation level is shown on the map; rival budgets are hidden.
- **Rival vs. rival competition:** wanted later, not in Phase 0. Until then rivals only drift slowly
  and react to the player.

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
| 1 | ~20 | 1 | 20 min | 5 |
| 2 | ~30 | 2 | 1 hr | ~15 |
| 3 | ~40 | 4 | 2.7 hr | ~20 |
| 4 | ~40 | 5 | 3.3 hr | ~30 |
| 5 | ~50 | 6 | 5 hr | ~50 |

**Pacing is for a typical anchor (decided 2026-09-13).** The turn budget above describes a
typical-size anchor country. Anchor size is the main difficulty lever: a huge anchor needs far more
hardcore fans and cash before its league can go Semi-Pro, so it reaches Local Curiosity much later,
and a tiny anchor is fragile. Leagues are not made cheaper to hide that.

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

- Win hold duration (likely resolved): the win almost certainly occurs at PP tier 5, where turns
  are years, so "X turns" ≈ X years. Confirm in balance runs.
- Music direction: postponed by choice; revisit late in production if ever.
- Commercial decisions — deferred by choice (2026-09-13): price, Early Access timing, demo scope,
  DLC, Steam page timing, platforms. Tech plan §11 holds the current thinking.
- Competitor analysis: a thorough Steam tag sweep (research task, not a design decision).
- Water as a genome surface option (parked 2026-09-13).
