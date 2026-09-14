# Sports Founder

Design contract: `sports-founder-gdd.md`. Build plan: `sports-founder-tech-plan.md`.
Mistakes to avoid: `sports-founder-technical-lessons.md`. Summary: `sports-founder-cheat-sheet.md`.

## Project map

```
content/              Game content and balance config (YAML data only; validated by Zod at load)
  config.yaml         Every tunable number: rates, weights, PP tier table, leagues, balance targets
  countries.yaml      Countries and their attributes (placeholder, invented)
  genome.yaml         Genome option modifiers and quick-start presets
  growth-tree.yaml    PP growth tree: categories and unlock tiers, nodes, effects, forks
  sports.yaml         Rival sports and the "other sports" bucket (placeholder, invented)
  names.yaml          All display names for countries and sports (the one moddable names file)
src/content/          Zod schemas + YAML loader. Pure: may import only zod and yaml
src/sim/              Simulation core. Pure and deterministic: may import only src/content,
                      pure-rand, and zod
src/runner/           Headless Node CLI: plays seeded campaigns and writes JSON/CSV
src/main/             Electron main process (window, security; later save file I/O and the
                      Steam adapter)
src/renderer/         React UI. The sim runs in a Web Worker (src/renderer/src/worker) via Comlink
scripts/              Purity check for src/sim and src/content; Electron smoke-test launcher
tests/                Vitest tests
runs/                 Runner and smoke-test output (git-ignored)
```

## Commands

- `npm run check`: type check, Biome, purity check, and tests. Run this before calling anything done.
- `npm run sim -- --campaigns 20 --turns 100`: headless runner, which writes to `runs/latest/`.
  `--help` lists the options, bots (greedy-spread, builder, anchor-turtle, media-rush, random) and
  experiments.
- `npm run sim -- --experiment all --campaigns 10 --turns 200`: every balance experiment for the
  tech plan exit criteria (differentiation, collapse, hard-anchor, pacing, options, rivals,
  benchmark). Misses are reported, never counted as passes. Every run also prints rival activity,
  the peak player hardcore share, the years to overtake the anchor's leading rival, and the growth
  tree report (nodes bought, fork choices, PP banked vs spent). The options experiment also checks
  that no growth node is owned in more than 40% of top-quartile runs.
- `npm run dev`: launch the app with hot reload.
- `npm run smoke`: build the app, launch it, click End Turn, and save screenshots and a report to
  `runs/smoke/`.
- `npm run build`: purity check, then production build.

## Architecture
- The simulation core is pure TypeScript. It must never import UI, DOM, Electron, or Steam code.
- The simulation is deterministic. All randomness goes through the seeded RNG. No Math.random().
- All balance numbers live in content/config files, never hardcoded in logic.
- Every tunable number lives in config (`content/config.yaml` or another content file).
- All game content is YAML validated by Zod schemas.
- All player-facing strings go through i18next. Never concatenate sentence fragments.
- All Steam calls go through the single Steam adapter file.
- The purity check (`npm run check:purity`, also run by `build` and the tests) fails if src/sim or
  src/content imports anything outside its allowlist, or uses Math.random, Date, performance,
  crypto, process, globalThis, or DOM globals. `tsconfig.pure.json` also gives those folders no
  DOM or Node types.
- The simulation advances in quarters (`stepQuarter`); a turn is N quarters, with N set by the PP
  tier table in config (`endTurn`). The UI updates once per turn from a `TurnSnapshot`.
- The genome, affinity, spread, league, cash, health, PP tier, poaching, rival defense, growth tree
  and generational turnover models follow the GDD; their numbers are tuning.
- The growth tree lives in `src/sim/growth.ts`. Owned nodes (`GameState.growthNodes`, purchase
  order) become per-country factors on rates, costs and countermove effects; every effect type is a
  closed vocabulary validated at load. Buying is the `buyNode` action: category unlocked at the
  current PP tier, prerequisites owned, no fork sibling owned, price = base cost × the peak tier's
  cost multiplier. No refunds. Purchases are landmarks; the snapshot lists every node's status.
- Generational turnover runs each quarter in `src/sim/quarter.ts`: every sport's hardcore fans above
  a floor age out at an annual rate and demote to casual about the same sport. The player and the
  rivals age out; the "other sports" bucket does not. Rivals recruit replacements for their aging
  fans from their own casual fans, so they hold their ground unless the player wins fans from them. Hardcore poaching is in `src/sim/poaching.ts`; the rival
  AI (budgets, escalation, countermoves) runs once per quarter in `src/sim/rivals.ts`, uses no
  randomness, and records every escalation change and countermove as a landmark. Rival genomes are
  campaign state. Budgets never appear in the `TurnSnapshot`.
- Every player action goes through `applyAction` in `src/sim/actions.ts`; bots use the same path.
- An anchor league collapse sets `outcome` and ends the campaign; `endTurn` refuses to continue.

## Steam
- Steam is deferred until the game is playable. Do not add steamworks.js, a Steam adapter, or
  Steam overlay window settings until then.

## Versions
- Electron, steamworks.js, PixiJS, and electron-builder are pinned to exact versions.
- All dependencies are pinned exactly (`.npmrc` has `save-exact=true`) and the lockfile is committed.
- Never upgrade dependencies or run `npm update` unless explicitly asked.
- Dependency upgrades happen only on a dedicated git branch and must pass the upgrade checklist.
- Do not add native Node modules.
- Vite stays on 7.x until electron-vite supports Vite 8 in a stable release.

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
