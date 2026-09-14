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
- **No dominant genome:** no single trait option appears in more than 40% of top-quartile runs.
- **No safe anchor:** every anchor country has a nonzero collapse rate under a naive strategy.
- **Hard anchors are winnable:** the best bot wins from Tuvalu some of the time.
- **Pacing:** time to each PP tier falls within ±30% of the GDD campaign budget table, measured on
  typical-size anchors (the middle half of countries by population); tiny and huge anchors are
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

---

## 3. Design Prerequisites (GDD Gaps That Block the Build)

These come from the GDD review. Items 1–4 must be specified before Phase 0 implementation begins.

| # | Gap | Why it blocks | Suggested direction |
|---|---|---|---|
| 1 | ~~**Genome mechanics**~~ | **Resolved 2026-09-12** — see GDD Sport Genome | ~10 discrete trait axes; accessibility traits drive casual conversion, depth traits drive hardcore; rival similarity eases casual, hinders hardcore; identity vs. rule traits |
| 2 | ~~**PP income source**~~ | **Resolved 2026-09-12** — see GDD PP Income | Base income from Fandom Score (diminishing returns) + moment bonuses as clickable map pickups; tier-scaled costs; quarterly sim step; turn length set by PP tier |
| 3 | ~~**Spread model**~~ | **Resolved 2026-09-12** — see GDD Spread Model | Only casual exposure crosses borders; proximity/language/media channels; focus slots; cold launches cost more; country-level granularity |
| 4 | ~~**Story → mechanics link**~~ | **Resolved 2026-09-12** — see GDD Event System | Moments + decision cards from recorded facts; closed effect vocabulary; decisions capped per turn; pickups auto-collect; negative events scale with tier |
| 5 | ~~**Fandom share definition**~~ | **Resolved 2026-09-12** — see GDD Fan Model | Three buckets (uninterested / casual / hardcore); hardcore exclusive and sticky; Fandom Score = hardcore + weighted casual |
| 6 | ~~**Rules-evolution trade-offs**~~ | **Resolved 2026-09-12** — see GDD Rules Evolution | PP cost, seasonal window, 1/year; backlash scales with hardcore base and rule age; global rules; proposals from player, broadcasters, sponsors, commissioners |
| 7 | ~~**Turn anatomy**~~ | **Resolved 2026-09-12** — see GDD Turn anatomy | 5-step turn; per-tier targets for markets, slots, pickups, cards, real time; anchor starts with founding amateur league; league attention via map signals + seasonal windows + crisis cards (no inbox) |
| 8 | ~~**Campaign length & replay**~~ | **Resolved 2026-09-12** — see GDD Campaign length | ~10–15 hr to first win; anchor country + genome as replay levers; anchor difficulty rating + Easy/Normal/Hard; multiple save slots, no ironman |
| 9 | ~~**Late-game pressure**~~ | **Resolved 2026-09-12** — see GDD Late-Game Pressure | Anchor resentment; generational hardcore turnover; rising running costs by league tier; rivals defend hardest near #1 |
| 9b | ~~**Rival AI**~~ | **Resolved 2026-09-12** — see GDD Rival AI | Real-world sports as rivals (present-day start; 7 sports + combat sports bucket + passive "other"); defense budgets; per-country escalation ladder; closed countermove list; rival-vs-rival later |
| 10 | ~~**Delegation**~~ | **Resolved 2026-09-12** — see GDD Delegation | Standing policies with per-country overrides; window business surfaces only in focus countries; trait-driven commissioners in Phase 1; player can always intervene |
| 11 | ~~**Showing the sport**~~ | **Resolved 2026-09-12** — see GDD Showing the sport | Rulebook page with dated amendments (Phase 0); field diagram (Phase 1); player-made logo/ball/kit + 9x16 image export (Phase 2) |
| 12 | ~~**Real vs. fictional world**~~ | **Resolved 2026-09-12** — see GDD Rival AI and Map and markets | Real sport names; generic/fictional leagues, governing bodies, tournaments, teams, players; all real-world-facing names in one moddable data file. Markets follow sports-body conventions; Natural Earth de facto boundaries with neutral hatching for contested areas. Get a legal check before the Steam page |
| 13 | **Standard production gaps** | Needed before Early Access | Onboarding/tutorial, UI information architecture, difficulty, audio, accessibility, localization, price/DLC, target audience, competitor analysis, playtest plan with success metrics |

As of 2026-09-13, items 1–12 are resolved in the GDD, along with all original parking-lot items.
Item 13 is resolved except commercial decisions (deferred by choice), competitor analysis
(research), and music (postponed). The win-hold measure is to be confirmed in balance runs.

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
| Saves | **JSON + fflate** | Compressed, versioned saves |
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
- Compressed JSON (fflate).
- Every save carries a format version, with migration steps so Early Access saves remain loadable.
- Atomic writes: write to a temp file, then swap, so a crash mid-save can't corrupt a campaign.
- Synced via Steam Cloud.
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
| Micromanagement at scale | Medium | Medium | Delegation via country commissioners |
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
