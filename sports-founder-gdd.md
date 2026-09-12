# Sports Founder — Game Design Document
*Version 1.0 | September 12, 2026*

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

---

## Game Loop

**Primary loop (two-tier):**
- **Global layer:** Spend Popularity Points (PP) on growth nodes (grassroots, media,
  infrastructure, culture, global).
- **Country layer:** Operator decisions within each active market — sponsor deals, rule-change
  responses, rivalry management, reacting to rival-sport pushback.

**Turn structure:** Variable-pace turns. Early game runs on seasons/quarters — fast, granular,
matches the scrappy inventor era. As the sport matures and more countries/leagues come online,
turns compress to years — macro, operator era. This pacing shift directly mirrors the
inventor-to-operator arc.

**Secondary loop:** Hitting popularity goals in specific countries/regions and watching the
resulting visible movement — new leagues forming, heatmap shifting, stories emerging. This is the
session-level payoff between "spend PP this turn" and "win globally."

**Primary decision:** Which country/market to push into next.

**Win condition:** Total global fandom share — become the #1 sport by aggregate global popularity.

**Loss condition:** The game ends if your *starting/anchor country's* league collapses (see League
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

**Phase 2 — Depth & richness (later-phase, same continuous build):**
9. Venue growth (mechanical — attendance feeds popularity; built alongside the business layer,
   not standalone).
10. Hall of Fame — a global "shrine," a persistent visible store of accumulated legacy/popularity
    over time.
11. Press coverage — flavor layer riding on top of the event generator.
12. World Cup / Olympics — scripted, single-elimination tournament, every 4 years, using existing
    team-strength ratings (not a full qualification simulation).
13. National teams — lightweight roster-pull from top club players, built to support the
    World Cup/Olympics event.
14. Awards (e.g., league MVP) — pure content flavor.
15. Custom scenarios/challenges + Steam leaderboards — replayability layer, depends on a complete,
    tunable core loop.
16. 9x16 camera-friendly design pass — not a standalone system; a visual discipline applied across
    key moment screens (see Tone & Art Direction).

---

## Progression & Economy

**Dual currency:**
- **Popularity Points (PP):** Global currency. Governs the sport itself — traits, rules, growth
  nodes.
- **Cash:** Per-country currency. Governs league business — teams, venues, sponsors. Managed
  independently per country's top-flight league (not pooled globally).

**Currency relationship:** One-directional. Higher PP tier unlocks better Cash opportunities
(sponsors take a maturing sport seriously). Cash does not feed back into PP.

**Cash sources:** Gate revenue (attendance × venue size), TV deals, sponsorships.

**Global PP Tier Track:** 5 qualitative tiers, from minor sport to global phenomenon (exact names
TBD). Crossing a tier unlocks new growth nodes/abilities but raises expectations and requirements —
the "growing pains" tension mechanic. This is independent of rival-sport pressure; the sport's own
growth is inherently destabilizing if you're not ready for it.

**League Health Ladder (per country):** Healthy → Struggling → Near-Collapse → Collapsed. Demotion
is driven by negative cash flow and falling local popularity. Local and largely reversible — except
in the anchor country, where full collapse ends the game.

**"Good run" texture:** Climbing the PP tier track while watching leagues in multiple countries
flourish — new stars, sponsor wins, storylines.

**"Bad run" texture:** A country sliding down the League Health Ladder, a rival sport capturing
ground you'd invested in, or worst of all, warning signs appearing in your anchor country while
your attention is elsewhere.

**Run structure:** Single continuous campaign toward global #1. No run restarts within a
playthrough. Custom scenarios/challenges (Phase 2, Steam leaderboard support) are expected to use a
separate, shorter run structure distinct from the main campaign — exact format TBD when that
system is scoped.

---

## Tone & Art Direction

**Tonal register:** Dry sports humor — deadpan, observational, almanac-with-a-wink. Not slapstick,
not tabloid hysteria.

**UI feel:** Stylized/illustrated, not clinical spreadsheet-style. The world map is the visual and
interactive center of the game.

**Reference points:** Plague Inc. (spread/heatmap fantasy, UI clarity), Football Manager (sim
depth, persistent entity management), Capitalism Lab (business/tycoon layer).

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

- Exact names and unlock thresholds for the 5 PP tiers.
- Precise trigger conditions for rival-sport AI aggression/countermoves.
- Custom scenario/challenge run structure and Steam leaderboard scoring metric.
- Tiered simulation depth thresholds (at what popularity level does a country go from
  "popularity number only" → "skeleton league" → "full roster simulation").
