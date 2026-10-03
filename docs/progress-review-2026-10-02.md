# Sports Founder — Progress review

October 2, 2026. Based on the implementation, development history, and GDD v1.12.

## Current position

We have a substantial, playable Phase 0 game. The global growth simulation is established; the biggest remaining work is making that growth feel like the history of a sport the player cares about.

The latest flagship-league, stars, and culture changes are design decisions awaiting implementation. The design has advanced beyond the current playable build.

A player can create a sport, choose its founding country, grow internationally, buy upgrades, manage league finances, respond to events, compete for global leadership, and save and resume.

## What we have accomplished

| Area | Implemented today | Comparison with the design |
|---|---|---|
| World and fan simulation | 213 sporting markets; country attributes and sourced starting data; casual and hardcore fans; conversion, churn, aging, and competition. | Substantial Phase 0 implementation. The world responds to the invented sport rather than applying identical growth everywhere. |
| Sport genome | Ten editable traits, four presets, country-specific fit hints, and effects on accessibility, depth, and geographic suitability. | The mechanical invention system exists. The sport's personal identity and visual expression remain limited. |
| International spread | Proximity, language, and media channels; limited focus slots; more expensive launches into unexposed markets. | Implements the central decision of where to push next. Diaspora and trade channels are later work. |
| Progression | Five PP tiers, changing turn lengths, unlocks, automatic promotion, demotion warnings, and focus-slot consequences. | Implements the inventor-to-global-operator progression structurally. Later tiers lack much of their planned management and content depth. |
| Growth tree | Twenty Grassroots and Media nodes, prerequisites, four exclusive forks, permanent choices, and prices that scale with sport size and peak tier. | The Phase 0 tree is built and playable. Infrastructure, Culture, and Global categories remain unbuilt. |
| Leagues and money | Automatic league formation; Amateur through Elite; local cash, income and costs; health deterioration; promotion, restructuring, and PP-funded bailouts. | Implements the abstract Phase 0 league model. Teams, fixtures, standings, players, and negotiated business opportunities are absent. |
| Rivals | Soccer and cricket defend through budgets, escalation, media campaigns, youth programs, broadcast restrictions, sponsor lockouts, and rule copying. A passive other-sports bucket exists. | Strong implementation of the Phase 0 tension system. The larger rival lineup remains future work. |
| Winning and losing | Anchor collapse ends a pre-win campaign. Winning requires global #1 at tier 5 for 30 consecutive turns. Play continues after winning; subsequent anchor collapse becomes history. | Core outcome rules are implemented. Legacy goals, retirement, and the final retrospective are missing. |
| Events | Eight playable cards, fact-based triggers, decisions with trade-offs, moment rewards, temporary local effects, cooldowns, and recent receipts. | The framework works. Content volume and narrative variety are below the planned 40–60-card Phase 0 library. |
| Interface | Live Pixi world map, country inspection, pan/zoom, tiny-market selection, trends, rival signals, growth board, league controls, and event board. | The accepted Clubhouse/Matchday visual direction is implemented. Animated recaps, map pickups, additional lenses, and fuller explanations remain. |
| Saving and history | Versioned, compressed, atomic saves; multiple campaign files; migrations; persistent landmarks and annual fan snapshots; restored country trends and pending events. | A strong foundation for long campaigns. The browsable Almanac, careers, records, and retrospective presentation still need building. |

See the [project documentation index](README.md) for playable screens and verification details.

### Balance work already completed

- Rival fan bases were corrected so incumbents hold their ground without expanding unrealistically on their own.
- Genome effects were revised so geographic specialization creates genuine trade-offs.
- Growth prices rise with the sport, preventing every successful campaign from buying the entire reachable tree.
- Rival defense intensifies around global #1, putting pressure on the victory hold.
- League costs and promotion requirements preserve the difficulty of very small and very large starting countries.
- Several strategy bots exercise the same legal actions as the player, supporting repeatable balance experiments.

## How the game reflects the design

### Invent a sport and spread it across the world

This promise is substantially represented. Genome choices affect geography, focus creates opportunity costs, rivals resist, and professionalization creates financial exposure.

### One earned story at a time

This promise is only beginning. Events correctly report actual simulation facts, but those facts mostly concern audiences, league status, and rival pressure. There are no championships, memorable players, club rivalries, careers, or inherited traditions yet. The game can explain that a market grew; it has fewer ways to make the player remember who made it happen.

### Inventor-to-operator arc

Creation provides the initial invention, but the player cannot subsequently evolve their rules. League operations center on promotion, rescue, and restructuring; meaningful sponsor and TV contracts are missing.

### Commissioner and culture

The latest designs directly address missing attachment. The GDD records that playtesting found the slice thin. Concentrating depth in one flagship league gives the player a specific institution to care about while keeping international growth central.

## Remaining work

### Finish and strengthen the existing slice

- Expand events toward the planned library.
- Improve early growth choices and retune endgame pressure.
- Add sport/club naming, difficulty guidance, and recommended starts.
- Add the generated prose rulebook.
- Improve turn feedback and explanations.

### Build the missing core depth

- Flagship league and commissioner's seat.
- Named teams, seasons, standings, and stars.
- Star backing and succession.
- Founding character.
- Emergent traditions and artifacts.
- Sponsor/TV contracts.
- Player rule changes and backlash.
- Anchor resentment.
- Standing policies and league directors.
- Remaining growth categories.
- Simple venue/youth development.
- Lightweight awards, press, and Hall of Fame.

### Later richness and release work

- World Championship and national teams.
- Deeper venues and legacy systems.
- Almanac and retirement retrospective.
- Scenarios and challenges.
- Expanded rivals.
- Sharing and export features.
- Complete controller and accessibility support.
- Steam integration, packaging, platform testing, localization, and late-stage sound.

### Smaller omissions with substantial player impact

- Creation lacks ownership: players choose mechanics but cannot yet name the sport or founding club.
- The sport lacks a readable identity: the current sport screen lists traits; the planned generated rulebook is absent.
- Growth feedback lacks spectacle: the map updates, but animated recaps and geographically placed story pickups are absent.
- Late-game delegation is missing: managing many leagues will need policies and clearer attention signals.
- Accessibility is partial: keyboard-accessible controls, patterns, and 1280×800 layouts exist; full controller navigation, scaling, rebinding, and Steam Deck validation are unfinished.
- Manual saves work; autosave and Steam Cloud do not exist.

## Recommended priorities

### 1. Give the player teams and people to care about

Build a focused flagship-league experience next. Establish the anchor as the flagship, with named teams, seasonal results, standings, and retained champions. Add a small number of persistent stars as league maturity permits, then the first meaningful star-backing decisions. Connect achievements to the existing event system and global spread.

The milestone should demonstrate a complete chain:

**A team or star achieves something → the player recognizes it → a consequential choice follows → the sport gains a visible history and geographic effect.**

That tests the central design concern more directly than another numerical expansion.

### 2. Make the invented sport feel personally owned

Add sport, club, and founding-ground names; the generated rulebook; then birthplace, ethos, colors/emblem, and terminology. This follows the recorded direction of stars, creation character, then culture. Founding character should seed traditions without becoming another affinity modifier.

### 3. Build culture together with decisions that can threaten it

Introduce a small set of traditions grounded in retained facts. Pair them with an initial sponsor/TV contract system and player rule evolution so loyalty has consequences: accepting a lucrative demand, changing an established rule, or moving the commissioner's seat can cost something fans value.

Traditions need to influence behavior. A famous ground becomes interesting when preserving it competes with money or expansion.

### 4. Strengthen the existing decision loop and rebalance it

Expand the event deck using richer flagship facts. Add bot policies that actively choose event options; current bots use neutral defaults, so they cannot establish whether paid choices are well balanced.

Address the two explicitly carried-forward balance gaps:

- Five upgrades—Backyard Clinics, Word of Mouth, Weekend Leagues, Fan Meetups, and Local Radio—were too consistently selected across strategies.
- The September 22 recorded rate of losing #1 before victory was 36%, below the design's roughly-half target.

These are historical measurements, not fresh measurements of the current event-enabled build. The [technical plan](../sports-founder-tech-plan.md) explicitly carries them forward. Genome-option dominance is a watch item rather than a reason to postpone player-facing progress.

### 5. Improve comprehension and campaign usability

Add starting-country difficulty explanations, onboarding, clearer growth drivers, stronger seasonal-window signaling, and better recap/map presentation. Continue accessibility work alongside these screens.

Measure actual human turn pacing: a bot reaching the intended victory turn does not prove a satisfying 10–15-hour campaign.

### Design decisions still open

A few flagship decisions need settling before their dependent features: which leagues can receive the seat, what happens when a non-anchor flagship collapses, and how much business detail other leagues eventually receive. The initial anchor-based flagship can be developed before all relocation behavior is implemented.

## Validation

The October 2 fresh `npm run check` passed:

- 717 tests across 25 files.
- Type checking.
- Simulation purity checks.
- Lint completed with existing warnings in older visual studies.

The latest recorded Electron smoke test passed creation, map, growth, league, event, and save/load flows, including identical continuation after loading, with no renderer errors or remote requests. That UI smoke was inspected, not rerun during this review.

The engineering foundation is in good condition. Automated correctness checks do not establish whether the game is fun.

## Recommended next milestone

**A flagship season the player remembers:** recognizable teams, an emerging star, a consequential decision, and a recorded achievement that visibly helps the sport spread.
