**Sports Founder — Technical Lessons from Sports Startup Tycoon**

*September 12, 2026 · Reference notes for design and implementation*

Sports Startup Tycoon did not meet its creator's goals. Its value to Founder is a small set of
engineering lessons, including examples of working infrastructure coexisting with shallow or
incomplete behavior. This review did not establish the causes of the game's failure.

Treat these notes as retrospective evidence, not a reuse plan or implementation specification.
Founder should earn each system through its own design needs. Existing code, dependencies,
mechanics, and architecture do not become requirements because they already exist. The
[GDD](sports-founder-gdd.md) and [technical plan](sports-founder-tech-plan.md) remain the places
for Founder-specific decisions.

**1. A working feature needs a meaningful behavioral test.** The prior game offers three sports,
but its match-scoring function uses the same basketball-style model for all three. Screens,
configuration fields, and passing tests can give a misleading impression of implemented depth.

For Founder, test an important promise through its consequences. With the starting conditions
held constant, changing a genome trait should produce an explainable difference in the intended
outcomes. Test that difference across several seeds. Separately, playtest whether the resulting
choice is understandable and interesting; functional correctness cannot establish that the game
is fun. Prove the invention-and-growth loop before expanding the surrounding business systems.

**2. Simple boundaries help; the underlying world model must fit the game.** The active project
has a TypeScript simulation that runs independently of React, using explicit state and seeded
randomness. That makes automated campaigns and reproducible investigations practical. Its
migration also removed database repositories and HTTP communication, so the simplification
cannot be attributed solely to replacing Python.

Founder can preserve the principle of an independently runnable simulation while defining its
own countries, leagues, sports, and separate currencies. The previous game's explicit
`playerLeague` and `rivalLeague` assumptions are too narrow. Choose storage and communication
boundaries around Founder's actual data and workload. The browser build demonstrates this
architecture at the previous game's scale; it does not establish global simulation performance
or desktop-platform compatibility.

**3. Stories and history need recorded facts.** Some prior headlines choose players and teams
independently and invent plausible player statistics. Old match and financial records are also
pruned, while the career retrospective calculates total revenue from the remaining ledger.
Presentation can therefore imply a history the simulation cannot substantiate.

Founder should generate factual headlines from recorded events, with references to the relevant
entities and outcomes. Preserve season summaries, career totals, and landmark events separately
from disposable detail. Define those records before building the Hall of Fame or retrospective
screens. A claim such as “record season” needs a retained record against which to compare it.
Atmospheric text should not invent achievements or results.

**4. Automated checks must test the intended experience.** All 129 unit tests passed, but the
batch runner failed one campaign's legitimacy threshold. It also counted some early owner-exodus
endings as passes because its assertions focused on bankruptcy and legitimacy. Its bot sometimes
cleared decisions directly, bypassing the choices a player would have to make.

For Founder, define what each experiment measures: reproducibility, valid state, survival rate,
strategy differences, or a specific failure condition. A loss can be legitimate in a balance
experiment, but must be reported and interpreted. Bots should use the same legal actions as
players. Add representative strategies and difficulties as those systems arrive. Check complete
relevant state for reproducibility, including continuation after save/load; a few matching annual
totals provide limited evidence.

**5. Saving is a complete player workflow.** The previous project separates saving behind an
adapter and stores versioned state, which is a useful boundary. However, its in-game Save button
always writes to slot `1`, despite the title screen offering multiple slots. A successful basic
save/load check did not expose that mismatch.

Founder should retain the active slot explicitly and verify creating, resuming, and saving in
different slots without overwriting another campaign. Preserve all state needed to continue the
simulation, including randomness. As formats evolve, retain representative older saves and
verify migration behavior. Keep long-term history requirements in the save design from the start.

**6. Time advancement should respect decisions and scale.** Persistent spending policies and
advance-to-milestone controls are useful patterns in the previous game. Its simulation currently
runs synchronously from the interface, however, so the working browser experience says little
about responsiveness with many countries or long advances.

For Founder, distinguish the simulation's internal time steps from how far the player asks to
advance. Define which events interrupt that advance and how ongoing costs and effects accrue.
Standing policies can reduce repeated administration as the sport grows. Benchmark representative
late-game states and long advances early, including the planned worker boundary and data transfer
costs. Choose simulation detail according to the decisions and stories it supports.

**Evidence and limits.** The review examined the active `app/` implementation in
`../sports_startup_tycoon/`, alongside its migration plan and backlog. An isolated copy passed
the production build and all 129 unit tests. The 25-seed runner had one campaign assertion failure;
its additional determinism check passed. A short browser check covered creation, management
screens, four weekly advances, and saving/reloading at week 5 without JavaScript errors. These
checks did not establish full-campaign quality, balance, or commercial readiness.

Useful source locations for revisiting the evidence:

- `portplan626.md`, `app/src/engine/state.ts`: migration rationale and world assumptions.
- `app/src/engine/systems/leagueSim.ts`, `narrative.ts`: match behavior and headline inputs.
- `app/src/engine/simulateWeek.ts`, `app/src/App.tsx`: history retention, retrospective, and save slot.
- `app/sim/run.ts`, `app/src/state/GameStateProvider.tsx`: simulation checks and interface execution.

All source paths above are relative to `../sports_startup_tycoon/`; the adjacent `narrative.ts`
is in `app/src/engine/systems/`.
